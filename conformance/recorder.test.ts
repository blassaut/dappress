import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import type { TraceChunk } from '../scripts/profile';

const SOURCE = fs.readFileSync(path.join(__dirname, 'recorder.js'), 'utf8');

/** A provider as a wallet injects it: request(), on(), and its flags. */
function fakeProvider(answer: (method: string) => unknown) {
  const listeners: Record<string, ((payload: unknown) => void)[]> = {};
  return {
    isMetaMask: true,
    request: async ({ method }: { method: string }) => answer(method),
    on: (name: string, listener: (payload: unknown) => void) => (listeners[name] ??= []).push(listener),
    emit: (name: string, payload: unknown) => (listeners[name] ?? []).forEach((listener) => listener(payload)),
  };
}

/** A page: a window with the events the recorder uses, and the recorder run in it. */
function page(ethereum?: ReturnType<typeof fakeProvider>) {
  const listeners: Record<string, ((event: unknown) => void)[]> = {};
  const win: Record<string, unknown> = {
    performance: { now: () => 42 },
    setInterval,
    clearInterval,
    setTimeout,
    console,
    Event: class {
      constructor(public type: string) {}
    },
    WeakSet,
    Object,
    addEventListener: (name: string, listener: (event: unknown) => void) => (listeners[name] ??= []).push(listener),
    dispatchEvent: (event: { type: string }) => (listeners[event.type] ?? []).forEach((listener) => listener(event)),
  };
  win.window = win;
  if (ethereum) win.ethereum = ethereum;
  vm.runInNewContext(SOURCE, win);
  // The trace is made in the page's realm: copied, so that it compares with values made here
  return { win, trace: () => JSON.parse(JSON.stringify(win.__dappressTrace)) as TraceChunk };
}

const rejected = Object.assign(new Error('User rejected the request.'), { code: 4001 });

test('a provider already injected: its requests, results and errors are recorded, with the flags', async () => {
  const provider = fakeProvider((method) => {
    if (method === 'personal_sign') throw rejected;
    return '0x1';
  });
  const { win, trace } = page(provider);
  const ethereum = win.ethereum as typeof provider;
  assert.equal(await ethereum.request({ method: 'eth_chainId' }), '0x1');
  await assert.rejects(ethereum.request({ method: 'personal_sign' }), rejected);
  assert.equal(trace().discovery?.flags.isMetaMask, true);
  assert.equal(trace().discovery?.injected, 'before');
  const entries = trace().entries as { kind: string; seq: number; at: number; ms: number; method: string; result?: unknown; error?: unknown }[];
  // Without the timings, which vary
  const settled = entries.map(({ seq, kind, method, result, error }) => JSON.parse(JSON.stringify({ seq, kind, method, result, error })));
  assert.deepEqual(settled, [
    { seq: 1, kind: 'request', method: 'eth_chainId', result: '0x1' },
    { seq: 2, kind: 'request', method: 'personal_sign', error: { code: 4001, message: 'User rejected the request.' } },
  ]);
  assert.ok(entries.every((entry) => typeof entry.at === 'number' && typeof entry.ms === 'number'));
});

test('the events of the provider are recorded with their payload', () => {
  const provider = fakeProvider(() => null);
  const { trace } = page(provider);
  provider.emit('chainChanged', '0x88bb0');
  provider.emit('accountsChanged', []);
  assert.deepEqual(
    trace().entries.map(({ kind, name, payload }: { kind: string; name?: string; payload?: unknown }) => ({ kind, name, payload })),
    [
      { kind: 'event', name: 'chainChanged', payload: '0x88bb0' },
      { kind: 'event', name: 'accountsChanged', payload: [] },
    ],
  );
});

test('a provider injected after the recorder is wrapped when it is set', async () => {
  const { win, trace } = page();
  assert.equal(trace().discovery?.injected, 'after');
  const provider = fakeProvider(() => '0x2');
  win.ethereum = provider;
  assert.equal(trace().discovery?.flags.isMetaMask, true);
  await (win.ethereum as typeof provider).request({ method: 'eth_chainId' });
  assert.equal(trace().entries.length, 1);
});

test('a provider announced through EIP-6963 is listed, and told from the injected one', () => {
  const provider = fakeProvider(() => null);
  const { win, trace } = page(provider);
  const dispatch = win.dispatchEvent as (event: unknown) => void;
  dispatch({ type: 'eip6963:announceProvider', detail: { info: { rdns: 'io.metamask', name: 'MetaMask' }, provider } });
  dispatch({ type: 'eip6963:announceProvider', detail: { info: { rdns: 'io.other', name: 'Other' }, provider: fakeProvider(() => null) } });
  assert.deepEqual(trace().discovery?.eip6963, [
    { rdns: 'io.metamask', name: 'MetaMask', sameAsInjected: true },
    { rdns: 'io.other', name: 'Other', sameAsInjected: false },
  ]);
});

test('a provider announced through EIP-6963 and injected behind a proxy is wrapped once', async () => {
  const provider = fakeProvider(() => '0x1');
  const { win, trace } = page();
  const dispatch = win.dispatchEvent as (event: unknown) => void;
  dispatch({ type: 'eip6963:announceProvider', detail: { info: { rdns: 'io.metamask', name: 'MetaMask' }, provider } });
  // The pattern @metamask/providers uses: the same provider, behind a proxy
  win.ethereum = new Proxy(provider, { deleteProperty: () => true });
  await (win.ethereum as typeof provider).request({ method: 'eth_chainId' });
  provider.emit('chainChanged', '0x2');
  assert.deepEqual(
    trace().entries.map((entry) => entry.kind),
    ['request', 'event'],
  );
  assert.equal(trace().discovery?.flags.isMetaMask, true);
});

test('a window.ethereum that forwards to the EIP-6963 provider records a request once, through the outer layer', async () => {
  const inner = fakeProvider(() => '0x1');
  const { win, trace } = page();
  const dispatch = win.dispatchEvent as (event: unknown) => void;
  dispatch({ type: 'eip6963:announceProvider', detail: { info: { rdns: 'app.phantom', name: 'Phantom' }, provider: inner } });
  // What Phantom does: another object, whose request() calls the announced provider's
  const outer = { isPhantom: true, request: (args: { method: string }) => inner.request(args), on: inner.on };
  win.ethereum = outer;
  assert.equal(await outer.request({ method: 'eth_chainId' }), '0x1');
  const entries = trace().entries as { via?: string; method?: string }[];
  assert.deepEqual(
    entries.map((entry) => [entry.method, entry.via]),
    [['eth_chainId', 'injected']],
  );
});

test('the wrapper is transparent: a synchronous error and a plain value come back as they were', () => {
  const provider = fakeProvider(() => null) as unknown as { request: (args: { method: string }) => unknown };
  const thrown = new TypeError('method is required');
  provider.request = ({ method }) => {
    if (!method) throw thrown;
    return 'sync';
  };
  const { win, trace } = page(provider as unknown as ReturnType<typeof fakeProvider>);
  const ethereum = win.ethereum as typeof provider;
  assert.throws(() => ethereum.request({ method: '' }), thrown);
  assert.equal(ethereum.request({ method: 'eth_chainId' }), 'sync');
  const entries = trace().entries as { error?: { message?: string }; result?: unknown }[];
  assert.equal(entries[0].error?.message, 'method is required');
  assert.equal(entries[1].result, 'sync');
});

test('run twice in a page, the recorder keeps the first trace', () => {
  const provider = fakeProvider(() => null);
  const { win } = page(provider);
  const first = win.__dappressTrace;
  vm.runInNewContext(SOURCE, win);
  assert.equal(win.__dappressTrace, first);
});
