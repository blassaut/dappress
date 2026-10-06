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
  const trace = { recorder: '1', discovery: { injected: null, flags: {}, eip6963: [] }, entries: [] };
  window.__dappressTrace = trace;

  // The identity flags wallets set on their provider, some of them on others' behalf
  const FLAGS = ['isMetaMask', 'isRabby', 'isCoinbaseWallet', 'isBraveWallet', 'isTrust', 'isPhantom', 'isOkxWallet', 'isZerion'];
  const EVENTS = ['connect', 'disconnect', 'accountsChanged', 'chainChanged'];
  let seq = 0;
  const now = () => Math.round(performance.now());
  const record = (entry) => trace.entries.push({ seq: ++seq, at: now(), ...entry });
  // What a dapp can read off a rejection: the code, the message, the data
  const plain = (error) => (error && typeof error === 'object' ? { code: error.code, message: error.message, data: error.data } : { message: String(error) });
  const wrapped = new WeakSet();
  // The providers announced through EIP-6963, to tell later whether window.ethereum is one of them:
  // MetaMask announces before it sets window.ethereum
  const announced = [];
  const refresh = () => announced.forEach(({ provider, entry }) => (entry.sameAsInjected = provider === window.ethereum));

  const wrap = (provider, injected) => {
    if (!provider || typeof provider.request !== 'function' || wrapped.has(provider)) return;
    wrapped.add(provider);
    trace.discovery.injected = trace.discovery.injected || injected;
    refresh();
    for (const flag of FLAGS) trace.discovery.flags[flag] = Boolean(provider[flag]);
    const request = provider.request;
    const recording = async (args) => {
      const started = now();
      const entry = { kind: 'request', method: args && args.method, params: args && args.params };
      try {
        const result = await request.call(provider, args);
        record({ ...entry, result, ms: now() - started });
        return result;
      } catch (error) {
        record({ ...entry, error: plain(error), ms: now() - started });
        throw error;
      }
    };
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
      for (const name of EVENTS) provider.on(name, (payload) => record({ kind: 'event', name, payload }));
    }
  };

  // EIP-6963: the providers announced, and whether the injected one is among them
  window.addEventListener('eip6963:announceProvider', (event) => {
    const detail = event.detail || {};
    const info = detail.info || {};
    // A wallet announces again at each request: one entry per provider
    if (announced.some((known) => known.provider === detail.provider)) return;
    const entry = { rdns: info.rdns, name: info.name, sameAsInjected: detail.provider === window.ethereum };
    announced.push({ provider: detail.provider, entry });
    trace.discovery.eip6963.push(entry);
    wrap(detail.provider, 'after');
  });
  window.addEventListener('ethereum#initialized', refresh);
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  // window.ethereum: there already, or injected after this script
  if (window.ethereum) {
    wrap(window.ethereum, 'before');
  } else {
    let provider;
    try {
      Object.defineProperty(window, 'ethereum', {
        configurable: true,
        enumerable: true,
        get: () => provider,
        set: (value) => {
          provider = value;
          wrap(value, 'after');
        },
      });
    } catch {
      /* polled below */
    }
    // A wallet that defines the property itself goes around the setter
    const poll = setInterval(() => {
      if (!window.ethereum) return;
      wrap(window.ethereum, 'after');
      clearInterval(poll);
    }, 50);
    setTimeout(() => clearInterval(poll), 10000);
  }
})();
