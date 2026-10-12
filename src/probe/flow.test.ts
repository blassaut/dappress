import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, classify, chunksOf, describeOutcome, plainTrace, OTHER_ACCOUNT, type Context, type Outcome } from './flow';
import type { TraceChunk } from '../profile-schema';

const ACCOUNT = '0x7b6bae7788079d5fd02dfcbb20f2adb5eb43174a';
const context = (): Context => ({ anvilUrl: 'http://127.0.0.1:8545', account: ACCOUNT, token: '0x5fbdb2315678afecb367f032d93f642f64180aa3' });

test("the flow follows the conformance suite's order, method by method", () => {
  const methods = STEPS.map((step) => (step.request ? step.request(context()).method : `anvil: ${step.title}`));
  assert.deepEqual(methods, [
    'eth_requestAccounts',
    'eth_requestAccounts',
    'wallet_getPermissions',
    'wallet_getCapabilities',
    'wallet_getCapabilities',
    'wallet_getCapabilities',
    'wallet_requestPermissions',
    'wallet_requestPermissions',
    'personal_sign',
    'personal_sign',
    'eth_signTypedData_v4',
    'eth_signTypedData_v4',
    'eth_sendTransaction',
    'wallet_addEthereumChain',
    'wallet_addEthereumChain',
    'wallet_switchEthereumChain',
    'wallet_switchEthereumChain',
    'wallet_switchEthereumChain',
    'wallet_switchEthereumChain',
    'anvil: Fund the account and deploy a test token on Anvil',
    'wallet_sendCalls',
    'eth_sendTransaction',
    'wallet_watchAsset',
    'wallet_watchAsset',
    'eth_sendTransaction',
    'wallet_revokePermissions',
    'wallet_getPermissions',
  ]);
  assert.equal(new Set(STEPS.map((step) => step.title)).size, STEPS.length, 'one title per step');
});

test('each step that waits for the user says what to do and which prompt it is', () => {
  for (const step of STEPS) {
    if (step.expect === 'none') continue;
    assert.ok(step.decision, `${step.title} names its prompt`);
    assert.match(step.instruction, /(Accept|Reject) in your wallet/, step.title);
  }
});

test('the requests carry what the earlier steps found out', () => {
  const byTitle = (title: string) => STEPS.find((step) => step.title === title)!;
  const sign = byTitle('Sign a message, accepted').request!(context());
  // "Dappress probe", as UTF-8 hex
  assert.deepEqual(sign.params, ['0x44617070726573732070726f6265', ACCOUNT]);
  const approve = byTitle('Approve the token, accepted').request!(context());
  assert.equal((approve.params as { to: string }[])[0].to, context().token);
  assert.match((approve.params as { data: string }[])[0].data, new RegExp(`^0x095ea7b3${'0'.repeat(24)}${OTHER_ACCOUNT.slice(2)}`));
  // Without an account, a step that needs one cannot be sent
  assert.throws(() => byTitle('Sign a message, accepted').request!({ anvilUrl: 'http://127.0.0.1:8545' }), /No account: the connection was not accepted/);
});

test('the connection teaches the flow its account; the setup, its token', async () => {
  const connect = STEPS.find((step) => step.title === 'Connect, accepted')!;
  const learned: Context = { anvilUrl: 'http://127.0.0.1:8545' };
  connect.learn!(learned, { result: [ACCOUNT.toUpperCase().replace('0X', '0x')], asked: true });
  assert.equal(learned.account, ACCOUNT);
  const setup = STEPS.find((step) => step.setup)!;
  const calls: string[] = [];
  await setup.setup!(learned, {
    fund: async (account) => void calls.push(`fund ${account}`),
    deployToken: async (holder) => {
      calls.push(`deploy for ${holder}`);
      return '0x5fbdb2315678afecb367f032d93f642f64180aa3';
    },
  });
  assert.deepEqual(calls, [`fund ${ACCOUNT}`, `deploy for ${ACCOUNT}`]);
  assert.equal(learned.token, '0x5fbdb2315678afecb367f032d93f642f64180aa3');
});

test('the verdict on an outcome: as asked, without asking, or not as asked', () => {
  const accepted: Outcome = { result: ['0xabc'], asked: true };
  const rejected: Outcome = { error: { code: 4001, message: 'User rejected the request.' }, asked: true };
  const refused: Outcome = { error: { code: 4901, message: 'Not connected to the chain' }, asked: false };
  assert.equal(classify('accept', accepted), 'as-asked');
  assert.equal(classify('reject', rejected), 'as-asked');
  assert.equal(classify('reject', accepted), 'not-as-asked');
  assert.equal(classify('accept', rejected), 'not-as-asked');
  assert.equal(classify('accept', refused), 'without-asking');
  assert.equal(classify('reject', { result: null, asked: false }), 'without-asking');
  // An error after asking, other than the user's rejection, is what the wallet does
  assert.equal(classify('accept', { error: { code: -32000, message: 'insufficient funds' }, asked: true }), 'as-asked');
  assert.equal(classify('none', rejected), 'as-asked');
});

const entry = (seq: number, method: string) => ({ kind: 'request' as const, seq, at: seq, method, result: null, ms: 1 });

test('the trace splits into one chunk per step, the discovery on the last', () => {
  const trace: TraceChunk = {
    recorder: '2',
    discovery: { injected: 'before', flags: { isMetaMask: true }, eip6963: [] },
    entries: [entry(1, 'eth_requestAccounts'), entry(2, 'eth_chainId'), entry(3, 'personal_sign'), entry(4, 'eth_accounts')],
  };
  const chunks = chunksOf(trace, [
    { test: 'Connect, accepted', to: 2 },
    { test: 'Sign a message, accepted', to: 3 },
  ]);
  assert.deepEqual(
    chunks.map((chunk) => [chunk.test, chunk.entries.map((e) => e.seq), Boolean(chunk.discovery)]),
    [
      ['Connect, accepted', [1, 2], false],
      ['Sign a message, accepted', [3], false],
      ['After the flow', [4], true],
    ],
  );
});

test('the trace leaves the page as plain JSON: a BigInt as a hex quantity, a cycle refused', () => {
  const trace = { recorder: '2', entries: [{ ...entry(1, 'eth_getBalance'), result: 255n }] } as unknown as TraceChunk;
  const [first] = plainTrace(trace).entries;
  assert.equal(first.kind === 'request' && first.result, '0xff');
  const cyclic = { recorder: '2', entries: [] } as unknown as TraceChunk & { self?: unknown };
  cyclic.self = cyclic;
  assert.throws(() => plainTrace(cyclic), /circular/i);
});

test("an outcome as the list of steps shows it: the error's code and message, or the result, a BigInt in it as hex", () => {
  assert.equal(describeOutcome({ error: { code: 4001, message: 'User rejected the request.' }, asked: true }), 'error 4001 User rejected the request.');
  assert.equal(describeOutcome({ result: { balance: 255n }, asked: false }), '{"balance":"0xff"}');
  assert.equal(describeOutcome({ result: undefined, asked: false }), 'undefined');
  assert.equal(describeOutcome({ result: 'a'.repeat(300), asked: false }).length, 201);
});
