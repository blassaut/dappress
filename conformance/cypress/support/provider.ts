// Send a request to the injected provider from the test, for wallet methods
// the test dapp has no button for. The request is left pending while the
// MetaMask command answers it; `result()` then yields what the dapp got back.

type Settled = { result: unknown } | { error: { code: number; message: string } };

type Provider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
};

declare global {
  interface Window {
    ethereum: Provider;
    /** The provider the wallet put in the page, kept by e2e.ts before the dapp replaced window.ethereum with a shim of its own. */
    dappressProvider?: Provider;
    dappressPending?: Promise<Settled>;
  }
}

/** The wallet's provider: what it injected, not what the dapp made of window.ethereum. */
export const walletOf = (win: Window): Provider => win.dappressProvider ?? win.ethereum;

export const provider = {
  request(method: string, params?: unknown) {
    cy.window({ log: false }).then((win) => {
      win.dappressPending = walletOf(win)
        .request({ method, params })
        .then(
          (result) => ({ result }),
          (error: { code: number; message: string }) => ({ error: { code: error.code, message: error.message } }),
        );
    });
  },

  result: () => cy.window({ log: false }).then((win) => win.dappressPending),

  call: (method: string, params?: unknown[]) => cy.window({ log: false }).then((win) => walletOf(win).request({ method, params })),

  // Ask again every half second until `isExpected` holds, for state that settles after a command returns
  waitFor(method: string, params: unknown[], isExpected: (value: unknown) => boolean, attempts = 20): Cypress.Chainable<unknown> {
    return provider.call(method, params).then((value) => {
      if (isExpected(value) || attempts === 0) return value;
      return cy.wait(500, { log: false }).then(() => provider.waitFor(method, params, isExpected, attempts - 1));
    });
  },
};
