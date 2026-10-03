// Cypress commands. Import this file from your support file:
//
//   import 'dappress/support';
//
// Each command asks the Node side (src/actions.js) to drive MetaMask through
// a Cypress task, then yields back to the test.

const options = Cypress.expose('dappress') || {};

// `shown` is what the command log displays for the argument, if anything
function metamask(action, argument = null, shown = '') {
  Cypress.log({ name: 'metamask', message: `${action} ${shown}`.trim() });
  return cy.task(`dappress:${action}`, argument, { log: false });
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
// Options are what to set on the confirmation before confirming it: { spendingCap, gas }
Cypress.Commands.add('confirmTransaction', (options) => metamask('confirmTransaction', options, options ? JSON.stringify(options) : ''));
Cypress.Commands.add('rejectTransaction', () => metamask('rejectTransaction'));
Cypress.Commands.add('approveAddToken', () => metamask('approveAddToken'));
Cypress.Commands.add('rejectAddToken', () => metamask('rejectAddToken'));

// The wallet's own accounts. A new or imported account becomes the selected
// one; the dapp sees it once it connects with it.
Cypress.Commands.add('addAccount', () => metamask('addAccount'));
Cypress.Commands.add('switchAccount', (name) => metamask('switchAccount', name, name));
// The private key is kept out of the command log
Cypress.Commands.add('importAccount', (privateKey) => metamask('importAccount', privateKey));

// A locked wallet keeps the dapp's requests behind its unlock screen
Cypress.Commands.add('lockWallet', () => metamask('lockWallet'));
Cypress.Commands.add('unlockWallet', () => metamask('unlockWallet'));

// The wallet's side of a disconnection: the site to remove from its
// permissions is the dapp under test, known by the origin of its window.
Cypress.Commands.add('disconnectFromDapp', () => {
  cy.location('origin', { log: false }).then((origin) => metamask('disconnectFromDapp', origin, origin));
});

// Connect, then move the dapp onto the network from the wallet setup, if there is one.
// `accounts` names the accounts to connect with, in place of the one MetaMask suggests.
Cypress.Commands.add('connectToDapp', (connection) => {
  metamask('connectToDapp', connection, connection?.accounts?.join(', '));
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
