import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { prepareExtension } from './download';

const VERSION = '13.50.0';
const RELEASE_URL = `https://github.com/MetaMask/metamask-extension/releases/download/v${VERSION}/metamask-chrome-${VERSION}.zip`;

const cacheDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dappress-download-'));
const zipPathIn = (dir: string) => path.join(dir, 'metamask', `metamask-chrome-${VERSION}.zip`);
const sha256 = (bytes: Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');
const options = (dir: string, metamaskChecksum: string | null = null) => ({ metamaskVersion: VERSION, metamaskChecksum, cacheDir: dir });

/** A zip archive of `files`, stored without compression. */
function zip(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    // Version, flags, method, time, date, CRC, sizes, name length, extra length
    const fields = Buffer.alloc(26);
    fields.writeUInt16LE(20, 0);
    fields.writeUInt32LE(zlib.crc32(data), 10);
    fields.writeUInt32LE(data.length, 14);
    fields.writeUInt32LE(data.length, 18);
    fields.writeUInt16LE(Buffer.byteLength(name), 22);
    const local = Buffer.concat([Buffer.from('PK\x03\x04'), fields, Buffer.from(name), data]);
    // Comment length, disk, attributes, then where the local header is
    const where = Buffer.alloc(14);
    where.writeUInt32LE(offset, 10);
    central.push(Buffer.concat([Buffer.from('PK\x01\x02'), Buffer.from([20, 0]), fields, where, Buffer.from(name)]));
    locals.push(local);
    offset += local.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(18);
  end.writeUInt16LE(central.length, 4);
  end.writeUInt16LE(central.length, 6);
  end.writeUInt32LE(directory.length, 8);
  end.writeUInt32LE(offset, 12);
  return new Uint8Array(Buffer.concat([...locals, directory, Buffer.from('PK\x05\x06'), end]));
}

/** What the download logged and warned, since mockFetch() was last called. */
const logged: string[] = [];

/** Answer every download with `respond`, quietly. Yields the URLs asked for. */
function mockFetch(t: TestContext, respond: () => Response): string[] {
  logged.length = 0;
  t.mock.method(console, 'log', (line: string) => void logged.push(line));
  t.mock.method(console, 'warn', (line: string) => void logged.push(line));
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url);
    return respond();
  });
  return urls;
}

test('a version already unpacked is reused, without a download', async (t) => {
  const urls = mockFetch(t, () => new Response(null, { status: 500 }));
  const dir = cacheDir();
  const unpacked = path.join(dir, 'metamask', VERSION);
  fs.mkdirSync(unpacked, { recursive: true });
  fs.writeFileSync(path.join(unpacked, 'manifest.json'), '{}');

  assert.equal(await prepareExtension(options(dir)), unpacked);
  assert.deepEqual(urls, []);
});

test("downloads the version's Chrome build from MetaMask's releases, checks it, and unpacks it", async (t) => {
  const archive = zip({ 'manifest.json': '{"name":"MetaMask"}', 'scripts/app.js': '// app' });
  const urls = mockFetch(t, () => new Response(archive));
  const dir = cacheDir();

  const unpacked = await prepareExtension(options(dir, sha256(archive)));
  assert.equal(unpacked, path.join(dir, 'metamask', VERSION));
  assert.deepEqual(urls, [RELEASE_URL]);
  assert.equal(fs.readFileSync(path.join(unpacked, 'manifest.json'), 'utf8'), '{"name":"MetaMask"}');
  assert.equal(fs.readFileSync(path.join(unpacked, 'scripts', 'app.js'), 'utf8'), '// app');
  // The archive is kept
  assert.ok(fs.existsSync(zipPathIn(dir)));
  assert.ok(!logged.some((line) => line.includes('No checksum known')), logged.join('\n'));
});

test('the checksum is read whatever the case of its hex', async (t) => {
  const archive = zip({ 'manifest.json': '{}' });
  mockFetch(t, () => new Response(archive));

  const unpacked = await prepareExtension(options(cacheDir(), sha256(archive).toUpperCase()));
  assert.ok(fs.existsSync(path.join(unpacked, 'manifest.json')));
});

test('an archive with another digest is refused and removed, and the error names both digests', async (t) => {
  const archive = zip({ 'manifest.json': '{}' });
  mockFetch(t, () => new Response(archive));
  const dir = cacheDir();
  const expected = 'a'.repeat(64);

  await assert.rejects(
    prepareExtension(options(dir, expected)),
    new RegExp(`metamask-chrome-${VERSION}\\.zip has SHA-256 ${sha256(archive)}, not ${expected}\\. The archive was removed`),
  );
  assert.ok(!fs.existsSync(zipPathIn(dir)));
  assert.ok(!fs.existsSync(path.join(dir, 'metamask', VERSION)), 'nothing is unpacked');
});

test('an archive already downloaded is checked too, without a download', async (t) => {
  const urls = mockFetch(t, () => new Response(null, { status: 500 }));
  const dir = cacheDir();
  const archive = zip({ 'manifest.json': '{}' });
  fs.mkdirSync(path.dirname(zipPathIn(dir)), { recursive: true });
  fs.writeFileSync(zipPathIn(dir), archive);

  const unpacked = await prepareExtension(options(dir, sha256(archive)));
  assert.ok(fs.existsSync(path.join(unpacked, 'manifest.json')));
  assert.deepEqual(urls, []);

  // Changed since: refused, and the next run downloads it again
  fs.rmSync(unpacked, { recursive: true });
  fs.writeFileSync(zipPathIn(dir), zip({ 'manifest.json': '{"tampered":true}' }));
  await assert.rejects(prepareExtension(options(dir, sha256(archive))), /The archive was removed/);
  assert.ok(!fs.existsSync(zipPathIn(dir)));
});

test('without a checksum, the archive is loaded as downloaded, with a warning', async (t) => {
  mockFetch(t, () => new Response(zip({ 'manifest.json': '{}' })));

  const unpacked = await prepareExtension(options(cacheDir()));
  assert.ok(fs.existsSync(path.join(unpacked, 'manifest.json')));
  assert.ok(
    logged.some((line) => line === `[dappress] No checksum known for MetaMask ${VERSION}: the archive is loaded as downloaded. Set metamaskChecksum to pin it`),
    logged.join('\n'),
  );
});

test('what a failed unpacking left behind is replaced', async (t) => {
  mockFetch(t, () => new Response(zip({ 'manifest.json': '{}' })));
  const dir = cacheDir();
  const unpacked = path.join(dir, 'metamask', VERSION);
  fs.mkdirSync(unpacked, { recursive: true });
  fs.writeFileSync(path.join(unpacked, 'leftover.js'), '');

  await prepareExtension(options(dir));
  assert.deepEqual(fs.readdirSync(unpacked), ['manifest.json']);
});

test('a release that cannot be downloaded fails with its URL and status, and leaves no archive', async (t) => {
  mockFetch(t, () => new Response('Not Found', { status: 404 }));
  const dir = cacheDir();

  await assert.rejects(prepareExtension(options(dir)), /Could not download https:\/\/github\.com\/.*metamask-chrome-13\.50\.0\.zip: HTTP 404/);
  assert.ok(!fs.existsSync(zipPathIn(dir)));
});

test('an archive without a manifest is not taken for a MetaMask build', async (t) => {
  mockFetch(t, () => new Response(zip({ 'readme.txt': 'not an extension' })));

  await assert.rejects(prepareExtension(options(cacheDir())), /does not look like a MetaMask build: no manifest\.json/);
});
