// Records what a dapp sees of its wallet: every request to window.ethereum
// with its result or error, every event with its payload, and how the
// provider turned up. Standalone on purpose: the conformance suite runs it in
// the page before MetaMask's test dapp loads (cypress/support/e2e.ts), and it
// can be pasted as is in the console of any browser to record another wallet
// by hand. The trace builds up in window.__dappressTrace;
// copy(JSON.stringify(window.__dappressTrace)) takes it out of a console.
// scripts/profile.ts turns it into a wallet profile.
(() => {
  if (window.__dappressTrace) return;
  // Whether the provider was there when the recorder ran, or came later
  const trace = { recorder: '2', discovery: { injected: window.ethereum ? 'before' : 'after', flags: {}, eip6963: [] }, entries: [] };
  window.__dappressTrace = trace;

  // The identity flags wallets set on their provider, some of them on others' behalf
  const FLAGS = ['isMetaMask', 'isRabby', 'isCoinbaseWallet', 'isBraveWallet', 'isTrust', 'isPhantom', 'isOkxWallet', 'isZerion'];
  const EVENTS = ['connect', 'disconnect', 'accountsChanged', 'chainChanged'];
  let seq = 0;
  const now = () => Math.round(performance.now());
  const record = (entry) => trace.entries.push({ seq: ++seq, at: now(), ...entry });
  // What a dapp can read off a rejection: the code, the message, the data
  const plain = (error) => (error && typeof error === 'object' ? { code: error.code, message: error.message, data: error.data } : { message: String(error) });
  // The request() functions this recorder installed: a provider wrapped once, through a proxy of it or not
  const recordings = new WeakSet();
  // A wallet whose window.ethereum forwards to its EIP-6963 provider (Phantom) runs one
  // request through two wrapped layers: the outer one records, the inner one passes
  let depth = 0;
  // The providers announced through EIP-6963, to tell later whether window.ethereum is one of them:
  // MetaMask announces before it sets window.ethereum
  const announced = [];
  const refresh = () => announced.forEach(({ provider, entry }) => (entry.sameAsInjected = provider === window.ethereum));

  // The flags of the injected provider, the one a dapp reads them on
  const describe = (provider) => {
    for (const flag of FLAGS) trace.discovery.flags[flag] = Boolean(provider[flag]);
  };

  // Which provider an entry went through: window.ethereum, or one announced
  // through EIP-6963 that is another object. A wallet may have both, and emit
  // its events on each: a dapp listening to one gets them once
  const via = (provider) => {
    if (provider === window.ethereum) return 'injected';
    const known = announced.find((candidate) => candidate.provider === provider);
    return known && known.entry.rdns ? `eip6963:${known.entry.rdns}` : 'eip6963';
  };

  // Wrap request() and listen to the events. The wrapper is transparent: a
  // value, a promise or a synchronous error comes back to the dapp as it was.
  const wrap = (provider) => {
    if (!provider || typeof provider.request !== 'function' || recordings.has(provider.request)) return;
    const request = provider.request;
    const recording = function (args) {
      const self = this === recording ? provider : this;
      if (depth > 0) return request.call(self, args);
      const started = now();
      const entry = { kind: 'request', via: via(provider), method: args && args.method, params: args && args.params };
      const settled = (outcome) => record({ ...entry, ...outcome, ms: now() - started });
      let returned;
      depth++;
      try {
        returned = request.call(self, args);
      } catch (error) {
        settled({ error: plain(error) });
        throw error;
      } finally {
        depth--;
      }
      if (!returned || typeof returned.then !== 'function') {
        settled({ result: returned });
        return returned;
      }
      return returned.then(
        (result) => {
          settled({ result });
          return result;
        },
        (error) => {
          settled({ error: plain(error) });
          throw error;
        },
      );
    };
    recordings.add(recording);
    // A plain assignment, then a definition when the provider's proxy ignores it
    try {
      provider.request = recording;
    } catch {
      /* defined below */
    }
    if (provider.request !== recording) {
      try {
        Object.defineProperty(provider, 'request', { value: recording, configurable: true, writable: true });
      } catch {
        console.warn('[dappress] recorder: the provider refuses a wrapped request(): requests are not recorded');
      }
    }
    if (typeof provider.on === 'function') {
      for (const name of EVENTS) provider.on(name, (payload) => record({ kind: 'event', via: via(provider), name, payload }));
    }
  };

  // EIP-6963: the providers announced, and whether the injected one is among them.
  // A dapp may send its requests through one of them rather than window.ethereum
  window.addEventListener('eip6963:announceProvider', (event) => {
    const detail = event.detail || {};
    const info = detail.info || {};
    // A wallet announces again at each request: one entry per provider
    if (announced.some((known) => known.provider === detail.provider)) return;
    const entry = { rdns: info.rdns, name: info.name, sameAsInjected: detail.provider === window.ethereum };
    announced.push({ provider: detail.provider, entry });
    trace.discovery.eip6963.push(entry);
    wrap(detail.provider);
  });
  window.addEventListener('ethereum#initialized', refresh);
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  // window.ethereum: there already, or injected after this script
  const injected = (provider) => {
    describe(provider);
    refresh();
    wrap(provider);
  };
  if (window.ethereum) {
    injected(window.ethereum);
  } else {
    let provider;
    try {
      Object.defineProperty(window, 'ethereum', {
        configurable: true,
        enumerable: true,
        get: () => provider,
        set: (value) => {
          provider = value;
          if (value) injected(value);
        },
      });
    } catch {
      /* polled below */
    }
    // A wallet that defines the property itself goes around the setter
    const poll = setInterval(() => {
      if (!window.ethereum) return;
      injected(window.ethereum);
      clearInterval(poll);
    }, 50);
    setTimeout(() => clearInterval(poll), 10000);
  }
})();
