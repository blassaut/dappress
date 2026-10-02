// Send a request to the injected provider from the test, for wallet methods
// the test dapp has no button for. The request is left pending while the
// MetaMask command answers it; `result()` then yields what the dapp got back.
export const provider = {
  request(method, params) {
    cy.window({ log: false }).then((win) => {
      win.dappressPending = win.ethereum.request({ method, params }).then(
        (result) => ({ result }),
        (error) => ({ error: { code: error.code, message: error.message } }),
      );
    });
  },

  result: () => cy.window({ log: false }).then((win) => win.dappressPending),

  call: (method, params) => cy.window({ log: false }).then((win) => win.ethereum.request({ method, params })),

  // Ask again every half second until `isExpected` holds, for state that settles after a command returns
  waitFor(method, params, isExpected, attempts = 20) {
    return provider.call(method, params).then((value) => {
      if (isExpected(value) || attempts === 0) return value;
      return cy.wait(500, { log: false }).then(() => provider.waitFor(method, params, isExpected, attempts - 1));
    });
  },
};
