// Cypress commands. Import this file from your support file:
//
//   import 'dappress/support';
//
// Each command asks the Node side (src/actions.js) to drive MetaMask through
// a Cypress task, then yields back to the test.

const options = Cypress.expose('dappress') || {};

function metamask(action) {
  Cypress.log({ name: 'metamask', message: action });
  return cy.task(`dappress:${action}`, null, { log: false });
}

function provider(method, params) {
  return cy.window({ log: false }).then((win) => win.ethereum.request({ method, params }));
}

Cypress.Commands.add('setupMetaMask', () => metamask('setupWallet'));
Cypress.Commands.add('rejectConnection', () => metamask('rejectConnection'));
Cypress.Commands.add('approveNewNetwork', () => metamask('approveNewNetwork'));
Cypress.Commands.add('rejectNewNetwork', () => metamask('rejectNewNetwork'));
Cypress.Commands.add('approveSwitchNetwork', () => metamask('approveSwitchNetwork'));
Cypress.Commands.add('rejectSwitchNetwork', () => metamask('rejectSwitchNetwork'));
Cypress.Commands.add('confirmSignature', () => metamask('confirmSignature'));
Cypress.Commands.add('rejectSignature', () => metamask('rejectSignature'));
Cypress.Commands.add('confirmTransaction', () => metamask('confirmTransaction'));
Cypress.Commands.add('rejectTransaction', () => metamask('rejectTransaction'));

// Connect, then move the dapp onto the network from the wallet setup, if there is one
Cypress.Commands.add('connectToDapp', () => {
  metamask('connectToDapp');
  if (options.network) cy.useNetwork(options.network);
});

// Move the dapp onto `network` (a wallet_addEthereumChain parameter), adding
// it to MetaMask if needed. A switch to a network the dapp is already allowed
// on settles at once; anything else makes MetaMask ask, and we approve.
Cypress.Commands.add('useNetwork', (network = options.network) => {
  if (!network) throw new Error('[dappress] cy.useNetwork() needs a network, or one in cypress/wallet.setup.js');
  Cypress.log({ name: 'metamask', message: `useNetwork ${network.chainName || network.chainId}` });
  cy.window({ log: false }).then((win) => {
    win.dappressNetwork = { settled: false };
    win.dappressNetwork.request = win.ethereum
      .request({ method: 'wallet_addEthereumChain', params: [network] })
      .then((result) => ({ result }), (error) => ({ error }))
      .finally(() => (win.dappressNetwork.settled = true));
  });
  cy.wait(1500, { log: false });
  cy.window({ log: false }).then((win) => {
    if (!win.dappressNetwork.settled) metamask('approveNetworkChange');
  });
  cy.window({ log: false }).then({ timeout: 60000 }, (win) => win.dappressNetwork.request).then(({ error }) => {
    if (error) throw new Error(`[dappress] MetaMask refused the network: ${error.message}`);
  });
  waitForChainId(network.chainId);
});

// The address the dapp sees, asked to the injected provider rather than to the
// MetaMask UI, so it keeps working across MetaMask versions.
Cypress.Commands.add('getAccountAddress', () => {
  Cypress.log({ name: 'metamask', message: 'getAccountAddress' });
  return provider('eth_accounts').then(([address]) => address);
});

// MetaMask announces the new chain to the dapp shortly after the switch
function waitForChainId(chainId, attempts = 20) {
  return provider('eth_chainId').then((current) => {
    if (current === chainId) return current;
    if (attempts === 0) throw new Error(`[dappress] The dapp is on chain ${current}, not ${chainId}`);
    return cy.wait(500, { log: false }).then(() => waitForChainId(chainId, attempts - 1));
  });
}

// Onboard or unlock the wallet once per spec, before the dapp needs it.
if (options.autoSetup !== false) {
  before(() => {
    cy.setupMetaMask();
  });
}
