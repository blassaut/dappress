// The types of the public API, shared by the plugin (index.ts) and the
// commands (support.ts), and the options as the plugin resolves them.

import type { Profile } from './wallet-profile';

/** A network, as passed to MetaMask's wallet_addEthereumChain. */
export interface Network {
  chainId: string;
  chainName: string;
  rpcUrls: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
  blockExplorerUrls?: string[];
  iconUrls?: string[];
}

/** What cypress/wallet.setup.ts exports. */
export interface WalletSetup {
  /**
   * The wallet to import. Without one, Dappress makes a new wallet for each run.
   * Prefer DAPPRESS_SEED_PHRASE in cypress.env.json or the environment: this file is usually committed.
   */
  seedPhrase?: string;
  /** The network the dapp is moved onto by cy.connectToDapp(). */
  network?: Network;
}

export interface DappressOptions extends WalletSetup {
  /** Password of the throwaway browser profile's wallet. Default: Tester@1234. */
  password?: string;
  /** MetaMask release to load, downloaded from GitHub on first run. */
  metamaskVersion?: string;
  /**
   * The SHA-256 of the MetaMask archive, to refuse any other. Default: the one
   * Dappress knows for the version, if any; otherwise the archive is loaded as
   * downloaded, with a warning.
   */
  metamaskChecksum?: string;
  /**
   * Keep MetaMask's backup and sync on. It saves the accounts and contacts of a
   * seed phrase and restores them on other installs. Default: false.
   */
  backupAndSync?: boolean;
  /** Run cy.setupMetaMask() before the first test of each spec. Default: true. */
  autoSetup?: boolean;
  /** Import the wallet once and reuse the profile across runs. Keeps the vault under cacheDir. Headed runs only. Default: false. */
  cache?: boolean;
  /** Time allowed for MetaMask to display a request, in ms. Default: 20000. */
  timeout?: number;
  /** Where MetaMask builds are cached. Default: ~/.cache/dappress. */
  cacheDir?: string;
  /**
   * Run the tests against a mock of a wallet, in place of the real MetaMask:
   * the name of a wallet Dappress ships a profile of, `metamask`, `rabby` or
   * `phantom`, or the path of a profile file. No extension, any browser.
   * Default: none, the real MetaMask.
   */
  mock?: string;
  /**
   * The RPC endpoint of the mock wallet: reads go there, and its unlocked
   * accounts sign and send, as Anvil's do. Default: http://127.0.0.1:8545.
   */
  rpcUrl?: string;
}

/** The options once resolved: every one has a value, the seed phrase included. */
export interface ResolvedOptions {
  metamaskVersion: string;
  metamaskChecksum: string | null;
  seedPhrase: string;
  password: string;
  network: Network | null;
  backupAndSync: boolean;
  autoSetup: boolean;
  cache: boolean;
  timeout: number;
  cacheDir: string;
  mock: string | null;
  rpcUrl: string;
}

/**
 * The subset of the options the browser side reads with Cypress.expose().
 * With a mock, the profile it replays and what the mock needs to run.
 */
export type PublicOptions = Pick<ResolvedOptions, 'metamaskVersion' | 'autoSetup' | 'network'> & {
  mock?: { profile: Profile; rpcUrl: string; timeout: number };
};

export type WalletState = 'onboarding' | 'locked' | 'unlocked';

export type ConnectOptions = {
  /**
   * The accounts to connect the dapp with, by their names in MetaMask:
   * `['Account 1', 'Account 2']`. These and no other are connected, in the
   * order MetaMask gives them to the dapp, whatever their order here.
   * Default: the account MetaMask suggests, the wallet's selected one.
   */
  accounts?: string[];
};

/** What cy.confirmTransaction() sets on the confirmation before confirming it. */
export interface TransactionOptions {
  /**
   * On an ERC-20 approval, the amount the spender may use, in tokens, as a user types it: 5 or '2.5'.
   * A string keeps an amount a number would round. Fails on a transaction that has no spending cap.
   */
  spendingCap?: number | string;
  /**
   * The network fee: one of the estimates MetaMask's fee editor offers for the network, or custom values.
   * Fails when MetaMask doesn't offer that estimate.
   */
  gas?: GasEstimate | CustomGas;
}

/**
 * An estimate of MetaMask's fee editor, by the name it shows. Low, Market and Aggressive are offered on the
 * networks MetaMask has fee estimates for; Network suggested on those it only has a gas price for, such as a local node.
 */
export type GasEstimate = 'low' | 'market' | 'aggressive' | 'networkSuggested';

/** The fields of the fee editor's advanced form, on an EIP-1559 transaction. One left out keeps MetaMask's value. */
export interface CustomGas {
  /** "Max base fee", in GWEI: the transaction's maxFeePerGas. */
  maxBaseFee?: number | string;
  /** "Priority fee", in GWEI: the transaction's maxPriorityFeePerGas. At most the max base fee. */
  priorityFee?: number | string;
  /** "Gas limit", in units of gas: 21000 or more. */
  gasLimit?: number | string;
}
