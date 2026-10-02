/// <reference types="cypress" />

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
  /** Prefer DAPPRESS_SEED_PHRASE in cypress.env.json or the environment: this file is usually committed. */
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
   * Keep MetaMask's backup and sync on. It saves the accounts and contacts of a
   * seed phrase and restores them on other installs. Default: false.
   */
  backupAndSync?: boolean;
  /** Run cy.setupMetaMask() before the first test of each spec. Default: true. */
  autoSetup?: boolean;
  /** Import the wallet once and reuse the profile across runs. Keeps the vault under cacheDir. Default: false. */
  cache?: boolean;
  /** Time allowed for MetaMask to display a request, in ms. Default: 20000. */
  timeout?: number;
  /** Where MetaMask builds are cached. Default: ~/.cache/dappress. */
  cacheDir?: string;
}

/**
 * Wire Dappress into a Cypress project, from setupNodeEvents:
 *
 *   setupNodeEvents(on, config) {
 *     return configureDappress(on, config);
 *   }
 */
export function configureDappress(
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  options?: DappressOptions,
): Cypress.PluginConfigOptions;
