/// <reference types="cypress" preserve="true" />

// Cypress commands. Import this file from your support file:
//
//   import 'dappress/support';
//
// Each command asks the Node side (src/actions.ts) to drive MetaMask through
// a Cypress task, then yields back to the test.

import type { ConnectOptions, Network, PublicOptions, TransactionOptions, WalletState } from './types';

export type { ConnectOptions, CustomGas, GasEstimate, TransactionOptions, WalletState } from './types';

declare global {
  // Cypress declares its commands in a namespace: that is where they are added
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Imports or unlocks the wallet. Runs by itself before each spec unless autoSetup is false. */
      setupMetaMask(): Chainable<WalletState>;
      /** Accepts the connection request, with the accounts named in `accounts` if any, then moves the dapp onto the wallet setup's network if there is one. */
      connectToDapp(options?: ConnectOptions): Chainable<void>;
      rejectConnection(): Chainable<void>;
      /** Disconnects the dapp from the wallet's permissions screen: the dapp gets an empty accountsChanged. */
      disconnectFromDapp(): Chainable<void>;
      /** Answers a signature request (personal_sign, eth_signTypedData_*). */
      confirmSignature(): Chainable<void>;
      rejectSignature(): Chainable<void>;
      /** Answers a transaction, including ERC-20 approvals. Confirming takes what to set first: a spending cap, a network fee. */
      confirmTransaction(options?: TransactionOptions): Chainable<void>;
      rejectTransaction(): Chainable<void>;
      /** Answers wallet_addEthereumChain. */
      approveNewNetwork(): Chainable<void>;
      rejectNewNetwork(): Chainable<void>;
      /** Answers the permission asked before switching to a network the dapp isn't allowed on yet. */
      approveSwitchNetwork(): Chainable<void>;
      rejectSwitchNetwork(): Chainable<void>;
      /** Answers wallet_watchAsset ("Add suggested tokens"). */
      approveAddToken(): Chainable<void>;
      rejectAddToken(): Chainable<void>;
      /** Adds an account to the wallet and selects it. Yields its name, "Account N". */
      addAccount(): Chainable<string>;
      /** Selects an account of the wallet by its name. */
      switchAccount(name: string): Chainable<void>;
      /** Imports an account from its private key and selects it. Yields its name. */
      importAccount(privateKey: string): Chainable<string>;
      /** Locks the wallet from MetaMask's menu: requests wait behind its unlock screen until it is unlocked. */
      lockWallet(): Chainable<void>;
      /** Unlocks a locked wallet with the configured password. Yields how it was found: "unlocked" when there was nothing to do. */
      unlockWallet(): Chainable<WalletState>;
      /** Moves the dapp onto a network, adding it to MetaMask if needed. Defaults to the wallet setup's network. Yields the chain id. */
      useNetwork(network?: Network): Chainable<string>;
      /** The address the dapp is connected with. */
      getAccountAddress(): Chainable<string>;
    }
  }
}

type Settled = { result?: unknown; error?: { message: string } };

// The dapp's window, with the provider MetaMask injects.
// Kept off the global Window, which the project under test may describe its own way.
type DappWindow = Cypress.AUTWindow & {
  ethereum: {
    request(args: { method: string; params?: unknown }): Promise<unknown>;
    on(event: string, listener: (value: string) => void): void;
    removeListener(event: string, listener: (value: string) => void): void;
  };
};

// A network change MetaMask makes without asking is answered well within this (ms)
const SILENT_SWITCH = 1500;
// How long MetaMask may take to announce the new chain to the dapp (ms)
const CHAIN_ANNOUNCED = 10000;

const options: Partial<PublicOptions> = Cypress.expose('dappress') || {};

const dappWindow = () => cy.window({ log: false }) as unknown as Cypress.Chainable<DappWindow>;

// `shown` is what the command log displays for the argument, if anything
function metamask<T = void>(action: string, argument: unknown = null, shown = ''): Cypress.Chainable<T> {
  Cypress.log({ name: 'metamask', message: `${action} ${shown}`.trim() });
  return cy.task<T>(`dappress:${action}`, argument, { log: false });
}

function provider<T>(method: string, params?: unknown): Cypress.Chainable<T> {
  return dappWindow().then((win) => win.ethereum.request({ method, params }) as Promise<T>);
}

Cypress.Commands.add('setupMetaMask', () => metamask<WalletState>('setupWallet'));
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
Cypress.Commands.add('addAccount', () => metamask<string>('addAccount'));
Cypress.Commands.add('switchAccount', (name) => metamask('switchAccount', name, name));
// The private key is kept out of the command log
Cypress.Commands.add('importAccount', (privateKey) => metamask<string>('importAccount', privateKey));

// A locked wallet keeps the dapp's requests behind its unlock screen
Cypress.Commands.add('lockWallet', () => metamask('lockWallet'));
Cypress.Commands.add('unlockWallet', () => metamask<WalletState>('unlockWallet'));

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
Cypress.Commands.add('useNetwork', (network = options.network ?? undefined) => {
  if (!network) throw new Error('[dappress] cy.useNetwork() needs a network, or one in cypress/wallet.setup.js');
  Cypress.log({ name: 'metamask', message: `useNetwork ${network.chainName || network.chainId}` });
  let request: Promise<Settled>;
  // Whether MetaMask asks: the request is still pending once a silent switch would have been answered
  dappWindow()
    .then((win) => {
      request = win.ethereum.request({ method: 'wallet_addEthereumChain', params: [network] }).then(
        (result): Settled => ({ result }),
        (error): Settled => ({ error }),
      );
      const silent = new Promise<boolean>((resolve) => setTimeout(resolve, SILENT_SWITCH, false));
      return Promise.race([request.then(() => true), silent]);
    })
    .then((answered) => {
      if (!answered) metamask('approveNetworkChange');
    });
  dappWindow()
    .then({ timeout: 60000 }, () => request)
    .then(({ error }) => {
      if (error) throw new Error(`[dappress] MetaMask refused the network: ${error.message}`);
    });
  waitForChainId(network.chainId);
});

// The address the dapp sees, asked to the injected provider rather than to the
// MetaMask UI, so it keeps working across MetaMask versions.
Cypress.Commands.add('getAccountAddress', () => {
  Cypress.log({ name: 'metamask', message: 'getAccountAddress' });
  return provider<string[]>('eth_accounts').then(([address]) => address);
});

// MetaMask announces the new chain to the dapp shortly after the switch: the
// dapp is on it already, or the provider's chainChanged says when it is
function waitForChainId(chainId: string): Cypress.Chainable<string> {
  return dappWindow().then({ timeout: CHAIN_ANNOUNCED + 1000 }, (win) => {
    return new Promise<string>((resolve, reject) => {
      let current: unknown;
      const settle = (act: () => void) => {
        clearTimeout(timer);
        win.ethereum.removeListener('chainChanged', onChainChanged);
        act();
      };
      const onChainChanged = (announced: unknown) => {
        current = announced;
        if (announced === chainId) settle(() => resolve(chainId));
      };
      const timer = setTimeout(() => settle(() => reject(new Error(`[dappress] The dapp is on chain ${current}, not ${chainId}`))), CHAIN_ANNOUNCED);
      // Listening first: a change announced while the chain is asked for is not missed
      win.ethereum.on('chainChanged', onChainChanged);
      win.ethereum.request({ method: 'eth_chainId' }).then(onChainChanged, () => {});
    });
  });
}

// Onboard or unlock the wallet once per spec, before the dapp needs it.
if (options.autoSetup !== false) {
  before(() => {
    cy.setupMetaMask();
  });
}
