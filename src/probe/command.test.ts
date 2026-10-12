import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, runCli, USAGE, type CliDeps } from './command';

function fakes(overrides: Partial<CliDeps> = {}) {
  const calls: string[] = [];
  const output: string[] = [];
  let stop: (() => void) | undefined;
  let exit: (() => void) | undefined;
  const deps: CliDeps = {
    startAnvil: async ({ port }) => {
      calls.push(`anvil ${port}`);
      return { url: `http://127.0.0.1:${port}`, stop: () => void calls.push('anvil stopped') };
    },
    startServer: async ({ anvilUrl }) => {
      calls.push(`server for ${anvilUrl}`);
      return { url: 'http://127.0.0.1:50123/', close: async () => void calls.push('server closed') };
    },
    log: (line) => void output.push(line),
    error: (line) => void output.push(`error: ${line}`),
    onStop: (handler) => {
      stop = handler;
    },
    onExit: (handler) => {
      exit = handler;
    },
    ...overrides,
  };
  return { deps, calls, output, stop: () => stop?.(), exit: () => exit?.() };
}

test('the arguments: probe, and the port of Anvil', () => {
  assert.deepEqual(parseArgs(['probe']), { command: 'probe', anvilPort: 8545 });
  assert.deepEqual(parseArgs(['probe', '--anvil-port', '9545']), { command: 'probe', anvilPort: 9545 });
  assert.deepEqual(parseArgs([]), { error: USAGE });
  assert.deepEqual(parseArgs(['record']), { error: `Unknown command "record".\n\n${USAGE}` });
  assert.deepEqual(parseArgs(['probe', '--anvil-port', 'x']), { error: `--anvil-port takes a port number, not "x".\n\n${USAGE}` });
  assert.deepEqual(parseArgs(['probe', '--open']), { error: `Unknown option "--open".\n\n${USAGE}` });
});

test('without a command, the usage, and a failure', async () => {
  const { deps, output } = fakes();
  assert.equal(await runCli([], deps), 1);
  assert.deepEqual(output, [`error: ${USAGE}`]);
});

test('probe starts Anvil, then the page for it, and says where to go and what not to use', async () => {
  const { deps, calls, output } = fakes();
  assert.equal(await runCli(['probe'], deps), undefined);
  assert.deepEqual(calls, ['anvil 8545', 'server for http://127.0.0.1:8545']);
  const said = output.join('\n');
  assert.match(said, /Open http:\/\/127\.0\.0\.1:50123\/ in the browser where the wallet to record is installed/);
  assert.match(said, /Use a test wallet: the profile holds its addresses and signatures/);
});

test('stopping the command closes the page and stops Anvil', async () => {
  const { deps, calls, stop } = fakes();
  await runCli(['probe'], deps);
  stop();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.slice(2), ['server closed', 'anvil stopped']);
});

test('Anvil that cannot start: its message, a failure, and no page', async () => {
  const { deps, calls, output } = fakes({
    startAnvil: async () => {
      throw new Error('[dappress] Anvil is not installed. It is part of Foundry: getfoundry.sh');
    },
  });
  assert.equal(await runCli(['probe'], deps), 1);
  assert.deepEqual(calls, []);
  assert.deepEqual(output, ['error: [dappress] Anvil is not installed. It is part of Foundry: getfoundry.sh']);
});

test('a page that cannot start stops Anvil', async () => {
  const { deps, calls, output } = fakes({
    startServer: async () => {
      throw new Error('[dappress] The probe page is not built: probe.js is missing from dist/probe');
    },
  });
  assert.equal(await runCli(['probe'], deps), 1);
  assert.deepEqual(calls, ['anvil 8545', 'anvil stopped']);
  assert.match(output.join('\n'), /The probe page is not built/);
});

test('a second signal does not close the page again', async () => {
  const { deps, calls, stop } = fakes();
  await runCli(['probe'], deps);
  stop();
  stop();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.slice(2), ['server closed', 'anvil stopped']);
});

test('Anvil stops when the process ends for another reason, an uncaught exception for one', async () => {
  const { deps, calls, exit } = fakes();
  await runCli(['probe'], deps);
  exit();
  assert.deepEqual(calls.slice(2), ['anvil stopped']);
});
