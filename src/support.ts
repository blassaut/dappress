/// <reference types="cypress" preserve="true" />

// Cypress commands. Import this file from your support file:
//
//   import 'dappress/support';
//
// Each command asks the Node side (src/actions.ts) to drive MetaMask through
// a Cypress task, then yields back to the test.

import { createMockWallet, installMockWallet } from './mock-wallet';
import type { ConnectOptions, Network, PublicOptions, TransactionOptions, WalletState } from './types';

export type { ConnectOptions, CustomGas, GasEstimate, TransactionOptions, WalletState } from './types';

/** The wallet under test: its name as it announces itself to dapps (EIP-6963), its version, and whether it is a mock. */
export interface WalletInfo {
  name: string;
  version: string;
  mock: boolean;
}

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
      /**
       * The wallet under test, as a dapp's wallet picker names it: `{ name: 'Rabby Wallet', version: '0.94.11', mock: true }`.
       * Pick it with `cy.getWallet().then(({ name }) => cy.contains('button', name).click())`.
       */
      getWallet(): Chainable<WalletInfo>;
      /** Sends a JSON-RPC request to the chain the dapp is on, and yields its result: `cy.rpc('eth_blockNumber')`. */
      rpc<T = unknown>(method: string, params?: unknown[]): Chainable<T>;
      /** Mines `blocks` blocks, 1 by default, on the chain the dapp is on: a development node, Anvil or Hardhat. */
      mine(blocks?: number): Chainable<void>;
      /** Moves the chain's clock `seconds` forward, and mines a block at that time: funding, expiries, vesting. */
      increaseTime(seconds: number): Chainable<void>;
      /** Writes `value` at storage `slot` of the contract at `address`, and mines a block: an oracle's price, a balance. */
      setStorageAt(address: string, slot: number | bigint | string, value: number | bigint | string): Chainable<void>;
    }
  }
}

type Settled = { result?: unknown; error?: { message: string } };

// The dapp's window, with the provider MetaMask injects.
// Kept off the global Window, which the project under test may describe its own way.
// What the commands use of a provider, MetaMask's or the mock's
type WalletProvider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on(event: string, listener: (value: unknown) => void): unknown;
  removeListener(event: string, listener: (value: unknown) => void): unknown;
};

type DappWindow = Cypress.AUTWindow & { ethereum: WalletProvider };

// A network change MetaMask makes without asking is answered well within this (ms)
const SILENT_SWITCH = 1500;
// How long MetaMask may take to announce the new chain to the dapp (ms)
const CHAIN_ANNOUNCED = 10000;

const options: Partial<PublicOptions> = Cypress.expose('dappress') || {};
const mock = options.mock;

const dappWindow = () => cy.window({ log: false }) as unknown as Cypress.Chainable<DappWindow>;

// The wallet's provider: the mock's own object, whatever the page made of
// window.ethereum meanwhile (a dapp may wrap or replace it), or the one
// MetaMask injected
const providerOf = (win: DappWindow): WalletProvider => (mockWallet ? mockWallet.provider : win.ethereum);

// With a mock, the wallet lives with the spec, as the extension would outlive
// the pages: it is put into each page the dapp loads, before the dapp runs
const mockWallet = mock && createMockWallet({ ...mock, log: (line) => Cypress.log({ name: 'mock', message: line }) });
if (mock && mockWallet) {
  Cypress.on('window:before:load', (win) => {
    installMockWallet(win, mockWallet, mock);
  });
}

// `shown` is what the command log displays for the argument, if anything.
// The real wallet is driven from Node, through a task; the mock from here.
function metamask<T = void>(action: string, argument: unknown = null, shown = ''): Cypress.Chainable<T> {
  Cypress.log({ name: 'metamask', message: `${action} ${shown}`.trim() });
  if (mock && mockWallet) {
    return cy.wrap(null, { log: false }).then({ timeout: mock.timeout + 5000 }, () => mockWallet.act(action, argument ?? undefined) as Promise<T>);
  }
  return cy.task<T>(`dappress:${action}`, argument, { log: false });
}

function provider<T>(method: string, params?: unknown): Cypress.Chainable<T> {
  return dappWindow().then((win) => providerOf(win).request({ method, params }) as Promise<T>);
}

Cypress.Commands.add('setupMetaMask', () => metamask<WalletState>('setupMetaMask'));
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
Cypress.Commands.add('importAccount', (privateKey) => {
  // The mock keeps no key: Node gives it the key's address, and the RPC endpoint acts for it
  if (mock) return cy.task<string>('dappress:addressOf', privateKey, { log: false }).then((address) => metamask<string>('importAccount', address));
  return metamask<string>('importAccount', privateKey);
});

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
      request = providerOf(win)
        .request({ method: 'wallet_addEthereumChain', params: [network] })
        .then(
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
// The wallet the dapp sees, by the name a wallet picker shows: Privy, RainbowKit and others list wallets by their EIP-6963 name
Cypress.Commands.add('getWallet', () => {
  const wallet: WalletInfo = mock
    ? { name: mock.profile.discovery?.eip6963[0]?.name ?? mock.profile.wallet.name, version: mock.profile.wallet.version, mock: true }
    : { name: 'MetaMask', version: options.metamaskVersion ?? '', mock: false };
  Cypress.log({ name: 'wallet', message: `${wallet.name} ${wallet.version}${wallet.mock ? ', mock' : ''}` });
  return cy.wrap(wallet, { log: false });
});

Cypress.Commands.add('getAccountAddress', () => {
  Cypress.log({ name: 'metamask', message: 'getAccountAddress' });
  return provider<string[]>('eth_accounts').then(([address]) => address);
});

// The chain itself, for what a test sets up beside the wallet: a block, the
// time, a contract's storage. These need a development node: Anvil, or a fork
// it runs, or Hardhat's. The methods are Hardhat's names, which Anvil takes too.
const chains = Object.fromEntries(Object.entries(options.chains ?? {}).map(([chain, url]) => [chain.toLowerCase(), url]));

/** The RPC endpoint of the chain the dapp is on: the mock's own, one the options name, or the wallet setup's network's. */
function chainEndpoint(): Cypress.Chainable<string> {
  if (mockWallet) return cy.wrap(null, { log: false }).then(() => mockWallet.chainEndpoint());
  return provider<string>('eth_chainId').then((chain) => {
    const id = chain.toLowerCase();
    const url = chains[id] ?? (options.network?.chainId.toLowerCase() === id ? options.network.rpcUrls[0] : undefined);
    if (!url) throw new Error(`[dappress] No RPC known for chain ${id}, which the dapp is on: name it in the chains option`);
    return url;
  });
}

Cypress.Commands.add('rpc', (method: string, params: unknown[] = []) => {
  Cypress.log({ name: 'chain', message: `${method} ${params.length ? JSON.stringify(params) : ''}`.trim() });
  return chainEndpoint().then((url) =>
    cy.request({ method: 'POST', url, body: { jsonrpc: '2.0', id: 1, method, params }, log: false }).then(({ body }) => {
      if (body.error) throw new Error(`[dappress] ${method} failed on ${url}: ${body.error.message}`);
      return body.result;
    }),
  );
});

Cypress.Commands.add('mine', (blocks = 1) => {
  cy.rpc('hardhat_mine', [`0x${blocks.toString(16)}`]);
});

Cypress.Commands.add('increaseTime', (seconds: number) => {
  cy.rpc('evm_increaseTime', [seconds]);
  cy.mine();
});

Cypress.Commands.add('setStorageAt', (address: string, slot: number | bigint | string, value: number | bigint | string) => {
  cy.rpc('hardhat_setStorageAt', [address, word(slot), word(value)]);
  cy.mine();
});

// A storage slot or value as the node takes it: 32 bytes in hex
function word(value: number | bigint | string): string {
  const hex = typeof value === 'string' ? value.replace(/^0x/, '') : BigInt(value).toString(16);
  if (!/^[0-9a-fA-F]{0,64}$/.test(hex)) throw new Error(`[dappress] ${String(value)} is not a 32-byte word`);
  return `0x${hex.padStart(64, '0')}`;
}

// MetaMask announces the new chain to the dapp shortly after the switch: the
// dapp is on it already, or the provider's chainChanged says when it is
function waitForChainId(chainId: string): Cypress.Chainable<string> {
  return dappWindow().then({ timeout: CHAIN_ANNOUNCED + 1000 }, (win) => {
    const provider = providerOf(win);
    return new Promise<string>((resolve, reject) => {
      // What the dapp was told of its chain meanwhile, for the error
      const heard: string[] = [];
      const settle = (act: () => void) => {
        clearTimeout(timer);
        provider.removeListener('chainChanged', onChainChanged);
        act();
      };
      const onChainChanged = (announced: unknown) => {
        heard.push(String(announced));
        if (announced === chainId) settle(() => resolve(chainId));
      };
      const timer = setTimeout(
        () =>
          settle(() =>
            reject(
              new Error(`[dappress] The dapp is not on chain ${chainId} after ${CHAIN_ANNOUNCED}ms: it heard ${heard.length ? heard.join(', ') : 'nothing'}`),
            ),
          ),
        CHAIN_ANNOUNCED,
      );
      // Listening first: a change announced while the chain is asked for is not missed
      provider.on('chainChanged', onChainChanged);
      provider.request({ method: 'eth_chainId' }).then(onChainChanged, (error: Error) => heard.push(`eth_chainId failed: ${error.message}`));
    });
  });
}

// Onboard or unlock the wallet once per spec, before the dapp needs it.
if (options.autoSetup !== false) {
  before(() => {
    cy.setupMetaMask();
  });
}
