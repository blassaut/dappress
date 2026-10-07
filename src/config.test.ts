import { test, beforeEach, afterEach, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULTS, METAMASK_CHECKSUMS, resolveOptions, publicOptions } from './config';

const ENV_KEYS = ['DAPPRESS_METAMASK_VERSION', 'DAPPRESS_METAMASK_CHECKSUM', 'DAPPRESS_SEED_PHRASE', 'DAPPRESS_PASSWORD', 'DAPPRESS_MOCK', 'DAPPRESS_RPC_URL'];
const SEED_PHRASE = 'one two three four five six seven eight nine ten eleven twelve';
const network = { chainId: '0x7a69', chainName: 'Anvil', rpcUrls: ['http://127.0.0.1:8545'], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } };

// The variables of the machine running the tests are kept out of them
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

/** A Cypress project, with `walletSetup` as the source of its cypress/wallet.setup.js if any. */
function project(walletSetup?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dappress-config-'));
  if (walletSetup) {
    fs.mkdirSync(path.join(dir, 'cypress'));
    fs.writeFileSync(path.join(dir, 'cypress', 'wallet.setup.js'), walletSetup);
  }
  return dir;
}

/** Keep what resolveOptions() logs out of the test output, and yield it. */
function quiet(t: TestContext): { logged: () => string } {
  const log = t.mock.method(console, 'log', () => {});
  const warn = t.mock.method(console, 'warn', () => {});
  return { logged: () => [...log.mock.calls, ...warn.mock.calls].map((call) => call.arguments.join(' ')).join('\n') };
}

test('the defaults, when nothing else is given', (t) => {
  quiet(t);
  const options = resolveOptions({ seedPhrase: SEED_PHRASE }, { projectRoot: project() });
  assert.deepEqual(options, { ...DEFAULTS, seedPhrase: SEED_PHRASE, metamaskChecksum: METAMASK_CHECKSUMS[DEFAULTS.metamaskVersion] });
});

test('the checksum of the MetaMask archive: the one known for the version, none for another, or the one set', (t) => {
  quiet(t);
  const projectRoot = project();
  assert.match(METAMASK_CHECKSUMS[DEFAULTS.metamaskVersion], /^[0-9a-f]{64}$/, 'the default version has a checksum');
  assert.equal(resolveOptions({ seedPhrase: SEED_PHRASE, metamaskVersion: '13.49.0' }, { projectRoot }).metamaskChecksum, METAMASK_CHECKSUMS['13.49.0']);
  assert.equal(resolveOptions({ seedPhrase: SEED_PHRASE, metamaskVersion: '13.48.0' }, { projectRoot }).metamaskChecksum, null);
  assert.equal(resolveOptions({ seedPhrase: SEED_PHRASE, metamaskChecksum: 'abc' }, { projectRoot }).metamaskChecksum, 'abc');
  const env = { DAPPRESS_METAMASK_CHECKSUM: 'def' };
  assert.equal(resolveOptions({ seedPhrase: SEED_PHRASE, metamaskChecksum: 'abc' }, { projectRoot, env }).metamaskChecksum, 'def');
});

test('the options given to configureDappress() replace the defaults', (t) => {
  quiet(t);
  const options = resolveOptions({ seedPhrase: SEED_PHRASE, password: 'Other@5678', timeout: 5000, cache: true }, { projectRoot: project() });
  assert.equal(options.password, 'Other@5678');
  assert.equal(options.timeout, 5000);
  assert.equal(options.cache, true);
  assert.equal(options.metamaskVersion, DEFAULTS.metamaskVersion);
});

test('the wallet setup file wins over the options, with module.exports or export default', (t) => {
  quiet(t);
  const setup = JSON.stringify({ seedPhrase: SEED_PHRASE, network });
  for (const source of [`module.exports = ${setup};`, `exports.default = ${setup};`]) {
    const options = resolveOptions({ seedPhrase: 'another phrase', password: 'Other@5678' }, { projectRoot: project(source) });
    assert.equal(options.seedPhrase, SEED_PHRASE);
    assert.deepEqual(options.network, network);
    assert.equal(options.password, 'Other@5678');
  }
});

test('a wallet setup file with unknown keys is refused, and the keys are named', () => {
  const projectRoot = project(`module.exports = { seedPhrase: '${SEED_PHRASE}', password: 'x', cache: true };`);
  assert.throws(() => resolveOptions({}, { projectRoot }), /Unknown keys in wallet\.setup\.js: password, cache/);
});

test('the Cypress env block wins over the wallet setup file', (t) => {
  quiet(t);
  const projectRoot = project(`module.exports = { seedPhrase: 'from the setup file' };`);
  const env = { DAPPRESS_SEED_PHRASE: SEED_PHRASE, DAPPRESS_PASSWORD: 'Env@1234', DAPPRESS_METAMASK_VERSION: '13.49.0' };
  const options = resolveOptions({ password: 'Other@5678' }, { projectRoot, env });
  assert.equal(options.seedPhrase, SEED_PHRASE);
  assert.equal(options.password, 'Env@1234');
  assert.equal(options.metamaskVersion, '13.49.0');
});

test('environment variables win over the Cypress env block', (t) => {
  quiet(t);
  process.env.DAPPRESS_SEED_PHRASE = SEED_PHRASE;
  process.env.DAPPRESS_METAMASK_VERSION = '13.48.0';
  const env = { DAPPRESS_SEED_PHRASE: 'from the env block', DAPPRESS_METAMASK_VERSION: '13.49.0', DAPPRESS_PASSWORD: 'Env@1234' };
  const options = resolveOptions({}, { projectRoot: project(), env });
  assert.equal(options.seedPhrase, SEED_PHRASE);
  assert.equal(options.metamaskVersion, '13.48.0');
  // Not in the environment: the env block still gives it
  assert.equal(options.password, 'Env@1234');
});

test('without a seed phrase, a new wallet is made for each run', (t) => {
  const output = quiet(t);
  const first = resolveOptions({}, { projectRoot: project() });
  const second = resolveOptions({}, { projectRoot: project() });
  assert.equal(first.seedPhrase.split(' ').length, 12);
  assert.notEqual(first.seedPhrase, second.seedPhrase);
  assert.match(output.logged(), /No seed phrase configured/);
  // The phrase itself stays out of the logs
  assert.ok(!output.logged().includes(first.seedPhrase));
});

test('without a seed phrase, the wallet cache is turned off', (t) => {
  const output = quiet(t);
  const options = resolveOptions({ cache: true }, { projectRoot: project() });
  assert.equal(options.cache, false);
  assert.match(output.logged(), /The wallet cache needs a seed phrase of your own/);
});

test('the defaults are left as they were', (t) => {
  quiet(t);
  resolveOptions({ cache: true, password: 'Other@5678' }, { projectRoot: project() });
  assert.equal(DEFAULTS.seedPhrase, null);
  assert.equal(DEFAULTS.cache, false);
  assert.equal(DEFAULTS.password, 'Tester@1234');
});

test('the options exposed to the browser hold no secret', (t) => {
  quiet(t);
  const options = resolveOptions({ seedPhrase: SEED_PHRASE, network, autoSetup: false }, { projectRoot: project() });
  assert.deepEqual(publicOptions(options), { metamaskVersion: DEFAULTS.metamaskVersion, autoSetup: false, network, chains: {}, timeout: DEFAULTS.timeout });
});
