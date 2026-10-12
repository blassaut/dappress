import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startProbeServer, PAGE_FILES, type ProbeServer } from './server';
import { SCHEMA, type Profile } from '../profile-schema';

const reference: Profile = {
  schema: SCHEMA,
  wallet: { name: 'MetaMask', version: '13.50.0' },
  recorded: { by: 'test', date: '2026-10-12', recorder: '2' },
  discovery: null,
  methods: {},
  events: {},
};

function pageRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dappress-probe-'));
  for (const file of Object.values(PAGE_FILES)) fs.writeFileSync(path.join(root, file.name), `/* ${file.name} */`);
  fs.writeFileSync(path.join(root, 'secret.txt'), 'not served');
  return root;
}

async function withServer(run: (server: ProbeServer) => Promise<void>): Promise<void> {
  const server = await startProbeServer({ root: pageRoot(), anvilUrl: 'http://127.0.0.1:8545', reference, dappressVersion: '0.11.0' });
  try {
    await run(server);
  } finally {
    await server.close();
  }
}

/** A raw request, with the Host header and the path exactly as given: fetch() would normalise both. */
function request(server: ProbeServer, { method = 'GET', target = '/', host }: { method?: string; target?: string; host?: string } = {}) {
  const { port } = new URL(server.url);
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: target, headers: { host: host ?? `127.0.0.1:${port}` } }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString()));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the page, its script, its style and the recorder are served, with their types', async () => {
  await withServer(async (server) => {
    for (const [route, file] of Object.entries(PAGE_FILES)) {
      const response = await request(server, { target: route });
      assert.equal(response.status, 200, route);
      assert.equal(response.headers['content-type'], file.type, route);
      assert.equal(response.body, `/* ${file.name} */`, route);
    }
  });
});

test("the page's config and the reference profile are served as JSON", async () => {
  await withServer(async (server) => {
    const config = await request(server, { target: '/config.json' });
    assert.deepEqual(JSON.parse(config.body), { anvilUrl: 'http://127.0.0.1:8545', dappressVersion: '0.11.0' });
    const profile = await request(server, { target: '/reference-profile.json' });
    assert.equal(JSON.parse(profile.body).wallet.name, 'MetaMask');
  });
});

test('nothing else is served: no other file, no way up the tree', async () => {
  await withServer(async (server) => {
    for (const target of [
      '/secret.txt',
      '/../secret.txt',
      '/%2e%2e/secret.txt',
      '/..%2fsecret.txt',
      '/index.html/..',
      '//etc/passwd',
      '/probe.js?x=../secret.txt',
    ]) {
      const response = await request(server, { target });
      if (target.startsWith('/probe.js?')) assert.equal(response.status, 200, target);
      else assert.equal(response.status, 404, target);
      assert.ok(!response.body.includes('not served'), target);
    }
  });
});

test('only GET and HEAD are answered', async () => {
  await withServer(async (server) => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const response = await request(server, { method });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.allow, 'GET, HEAD', method);
    }
    const head = await request(server, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
  });
});

test('a request for another host is refused: a site pointing its own name at the machine reads nothing', async () => {
  await withServer(async (server) => {
    const { port } = new URL(server.url);
    assert.equal((await request(server, { host: 'evil.example' })).status, 403);
    assert.equal((await request(server, { host: `evil.example:${port}` })).status, 403);
    assert.equal((await request(server, { host: `localhost:${port}` })).status, 200);
  });
});

test('a host that only looks like the loopback is refused, on every route and method', async () => {
  await withServer(async (server) => {
    const { port } = new URL(server.url);
    const lookalikes = [
      `127.0.0.1:${port}.evil.example`,
      `127.0.0.1.evil.example:${port}`,
      `evil.example:${port}@127.0.0.1`,
      `LOCALHOST:${port}`,
      '127.0.0.1',
      `127.0.0.1:${port + 1}`,
      `[::1]:${port}`,
      `0.0.0.0:${port}`,
      'localhost',
    ];
    for (const host of lookalikes) {
      for (const method of ['GET', 'HEAD', 'POST']) {
        for (const target of ['/', '/config.json', '/reference-profile.json']) {
          const response = await request(server, { method, target, host });
          assert.equal(response.status, 403, `${method} ${target} Host: ${JSON.stringify(host)}`);
          assert.ok(!response.body.includes('anvilUrl') && !response.body.includes('MetaMask'), host);
        }
      }
    }
  });
});

test('a request line in absolute form does not reach another route or the disk', async () => {
  await withServer(async (server) => {
    const { port } = new URL(server.url);
    for (const target of [`http://127.0.0.1:${port}/probe.js`, 'http://evil.example/secret.txt', 'file:///etc/passwd', '*']) {
      const response = await request(server, { target });
      assert.equal(response.status, 404, target);
      assert.ok(!response.body.includes('not served'), target);
    }
  });
});

test('every answer carries the security headers, the policy naming Anvil', async () => {
  await withServer(async (server) => {
    // The refusals carry them too, whatever the reason
    const answers = [
      await request(server, { target: '/' }),
      await request(server, { target: '/missing' }),
      await request(server, { method: 'POST' }),
      await request(server, { host: 'evil.example' }),
    ];
    assert.deepEqual(
      answers.map((answer) => answer.status),
      [200, 404, 405, 403],
    );
    for (const { headers } of answers) {
      assert.equal(
        headers['content-security-policy'],
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:8545; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      );
      assert.equal(headers['x-content-type-options'], 'nosniff');
      assert.equal(headers['referrer-policy'], 'no-referrer');
      assert.equal(headers['cache-control'], 'no-store');
    }
  });
});

test('the server listens on the loopback only, on a port of its own', async () => {
  await withServer(async (server) => {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  });
});

test('a page file missing from the build fails the start, not a later request', async () => {
  const root = pageRoot();
  fs.rmSync(path.join(root, 'probe.js'));
  await assert.rejects(
    startProbeServer({ root, anvilUrl: 'http://127.0.0.1:8545', reference, dappressVersion: '0.11.0' }),
    /The probe page is not built: probe\.js is missing/,
  );
});
