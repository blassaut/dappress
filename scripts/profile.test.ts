import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProfile, diffProfiles, readTrace, shape, SCHEMA, type Profile, type TraceChunk } from './profile';

const REJECTED = { code: 4001, message: 'User rejected the request.' };
const discovery = {
  injected: 'before' as const,
  flags: { isMetaMask: true, isRabby: false },
  eip6963: [{ rdns: 'io.metamask', name: 'MetaMask', sameAsInjected: true }],
};
const meta = { wallet: { name: 'MetaMask', version: '13.50.0' }, recorded: { by: 'dappress 0.6.1', date: '2026-10-06T00:00:00.000Z', mode: 'sidepanel' } };

const chunks: TraceChunk[] = [
  {
    recorder: '1',
    test: 'connectToDapp',
    discovery,
    entries: [
      { kind: 'request', seq: 1, at: 10, method: 'eth_requestAccounts', params: undefined, result: ['0xabc'], ms: 1200 },
      { kind: 'event', seq: 2, at: 11, name: 'accountsChanged', payload: ['0xabc'] },
      { kind: 'event', seq: 3, at: 12, name: 'chainChanged', payload: '0x88bb0' },
    ],
  },
  {
    recorder: '1',
    test: 'rejectSignature (personal_sign)',
    entries: [
      { kind: 'request', seq: 4, at: 20, method: 'personal_sign', params: ['0x68656c6c6f', '0xabc'], error: REJECTED, ms: 300 },
      // The suite asks the same thing again while it waits: counted, not listed
      { kind: 'request', seq: 5, at: 21, method: 'eth_accounts', params: undefined, result: ['0xabc'], ms: 2 },
      { kind: 'request', seq: 6, at: 22, method: 'eth_accounts', params: undefined, result: ['0xabc'], ms: 2 },
      { kind: 'request', seq: 7, at: 23, method: 'eth_accounts', params: undefined, result: [], ms: 2 },
    ],
  },
];

test('the profile groups the observations by method and by event, with the test each came from', () => {
  const profile = buildProfile(chunks, meta);
  assert.equal(profile.schema, SCHEMA);
  assert.deepEqual(profile.wallet, { name: 'MetaMask', version: '13.50.0' });
  assert.deepEqual(profile.recorded, { ...meta.recorded, recorder: '1' });
  assert.deepEqual(profile.discovery, discovery);
  assert.deepEqual(Object.keys(profile.methods), ['eth_accounts', 'eth_requestAccounts', 'personal_sign']);
  assert.deepEqual(profile.methods.personal_sign, [{ test: 'rejectSignature (personal_sign)', params: ['0x68656c6c6f', '0xabc'], error: REJECTED }]);
  assert.deepEqual(profile.methods.eth_requestAccounts, [{ test: 'connectToDapp', params: undefined, result: ['0xabc'] }]);
  assert.deepEqual(profile.events.chainChanged, [{ test: 'connectToDapp', payload: '0x88bb0' }]);
});

test('a request repeated with the same answer is counted once, and listed again when the answer changes', () => {
  const profile = buildProfile(chunks, meta);
  assert.deepEqual(profile.methods.eth_accounts, [
    { test: 'rejectSignature (personal_sign)', params: undefined, result: ['0xabc'], count: 2 },
    { test: 'rejectSignature (personal_sign)', params: undefined, result: [] },
  ]);
});

test('a value too long to say anything of the wallet is kept by its shape', () => {
  const bytecode = `0x${'60'.repeat(2000)}`;
  const block = { number: '0x1', transactions: Array.from({ length: 50 }, (_, i) => ({ hash: `0x${String(i).padStart(64, '0')}` })) };
  const profile = buildProfile(
    [
      {
        recorder: '1',
        entries: [
          { kind: 'request', seq: 1, at: 1, method: 'eth_sendTransaction', params: [{ from: '0xabc', data: bytecode }], result: '0x1', ms: 1 },
          { kind: 'request', seq: 2, at: 2, method: 'eth_getBlockByNumber', params: ['latest', true], result: block, ms: 1 },
          { kind: 'request', seq: 3, at: 3, method: 'eth_getBlockByNumber', params: ['latest', true], result: { ...block, number: '0x2' }, ms: 1 },
        ],
      },
    ],
    meta,
  );
  assert.deepEqual(profile.methods.eth_sendTransaction[0].params, {
    $truncated: JSON.stringify([{ from: '0xabc', data: bytecode }]).length,
    shape: '[{data, from}]',
  });
  assert.equal(profile.methods.eth_sendTransaction[0].result, '0x1');
  // Two blocks of the same shape: one observation
  assert.deepEqual(profile.methods.eth_getBlockByNumber, [
    { test: undefined, params: ['latest', true], result: { $truncated: JSON.stringify(block).length, shape: '{number, transactions}' }, count: 2 },
  ]);
});

test('the observations keep the order of the chunks, whatever the page clock says', () => {
  const profile = buildProfile(
    [
      { recorder: '1', test: 'first', entries: [{ kind: 'request', seq: 7, at: 900, method: 'eth_chainId', result: '0x1', ms: 1 }] },
      // After a reload: the clock and the sequence start again
      { recorder: '1', test: 'second', entries: [{ kind: 'request', seq: 1, at: 10, method: 'eth_chainId', result: '0x2', ms: 1 }] },
    ],
    meta,
  );
  assert.deepEqual(
    profile.methods.eth_chainId.map((observation) => observation.test),
    ['first', 'second'],
  );
});

test('the discovery is the last recorded: it fills in as the page goes', () => {
  const later = { ...discovery, eip6963: [...discovery.eip6963, { rdns: 'io.other', name: 'Other', sameAsInjected: false }] };
  const profile = buildProfile([chunks[0], { ...chunks[1], discovery: later }], meta);
  assert.deepEqual(profile.discovery, later);
});

test('a trace with no discovery and no test, as a console copy gives it, still builds', () => {
  const profile = buildProfile([{ recorder: '1', entries: chunks[1].entries }], meta);
  assert.equal(profile.discovery, null);
  assert.equal(profile.methods.personal_sign[0].test, undefined);
});

test('the trace is read as one chunk, a list of chunks, or one chunk per line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dappress-profile-'));
  const one = path.join(dir, 'one.json');
  fs.writeFileSync(one, JSON.stringify(chunks[0]));
  assert.equal(readTrace(one).length, 1);
  const list = path.join(dir, 'list.json');
  fs.writeFileSync(list, JSON.stringify(chunks, null, 2));
  assert.equal(readTrace(list).length, 2);
  const lines = path.join(dir, 'lines.jsonl');
  fs.writeFileSync(lines, chunks.map((chunk) => JSON.stringify(chunk)).join('\n') + '\n');
  assert.equal(readTrace(lines).length, 2);
  const empty = path.join(dir, 'empty.jsonl');
  fs.writeFileSync(empty, '');
  assert.deepEqual(readTrace(empty), []);
});

test('the shape of a value keeps what a dapp branches on', () => {
  assert.equal(shape('0x88bb0'), 'hex(5)');
  assert.equal(shape('0x' + 'a'.repeat(130)), 'hex(130)');
  assert.equal(shape(34999), 'number(34999)');
  assert.equal(shape('User rejected the request.'), '"User rejected the request."');
  assert.equal(shape('x'.repeat(200)), 'string(200)');
  assert.equal(shape(['0xabc']), '[hex(3)]');
  assert.equal(shape([1, 2, 3, 4]), 'array(4)');
  assert.equal(shape({ chainId: '0x1', rpcUrls: [] }), '{chainId, rpcUrls}');
  assert.equal(shape(null), 'null');
  assert.equal(shape(true), 'true');
  assert.equal(shape({ $truncated: 4020, shape: '{number, transactions}' }), '{number, transactions}');
});

test('the diff names the methods and events the two wallets answer differently', () => {
  const metamask = buildProfile(chunks, meta);
  const other: Profile = {
    ...buildProfile(chunks, { wallet: { name: 'Other', version: '1.0.0' }, recorded: meta.recorded }),
    discovery: { injected: 'after', flags: { isMetaMask: true, isRabby: true }, eip6963: [{ rdns: 'io.other', name: 'Other' }] },
    methods: {
      eth_accounts: [{ params: undefined, result: ['0xabc'] }],
      eth_requestAccounts: [{ params: undefined, result: ['0xabc'] }],
      personal_sign: [{ params: ['0x68656c6c6f', '0xabc'], error: { code: 4001, message: 'User denied message signature.' } }],
      wallet_switchEthereumChain: [{ params: [{ chainId: '0x1' }], result: null }],
    },
    events: { chainChanged: [{ payload: 559171 }] },
  };
  const diff = diffProfiles(metamask, other);
  assert.match(diff, /^# MetaMask 13\.50\.0 vs Other 1\.0\.0/);
  assert.match(diff, /\| isRabby \| false \| true \|/);
  assert.match(diff, /\| EIP-6963 \| io\.metamask \| io\.other \|/);
  assert.match(diff, /\| `eth_requestAccounts` \| result \[hex\(3\)\] \| result \[hex\(3\)\] \| yes \|/);
  assert.match(diff, /\| `personal_sign` \| error 4001 "User rejected the request\." \| error 4001 "User denied message signature\." \| \*\*no\*\* \|/);
  assert.match(diff, /\| `wallet_switchEthereumChain` \| not observed \| result null \| \*\*no\*\* \|/);
  assert.match(diff, /\| `chainChanged` \| hex\(5\) \| number\(559171\) \| \*\*no\*\* \|/);
  assert.match(diff, /\| `accountsChanged` \| \[hex\(3\)\] \| not observed \| \*\*no\*\* \|/);
});
