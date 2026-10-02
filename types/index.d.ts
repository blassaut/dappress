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

/** What cypress/wallet.setup.js exports. */
export interface WalletSetup {
  /** Prefer DAPPRESS_SEED_PHRASE in cypress.env.json or the environment: this file is usually committed. */
  seedPhrase?: string;
  password?: string;
  /** The network the dapp is moved onto by cy.connectToDapp(). */
  network?: Network;
}

export interface DappressOptions extends WalletSetup {
  /** MetaMask release to load, downloaded from GitHub on first run. */
  metamaskVersion?: string;
  /** Run cy.setupMetaMask() before the first test of each spec. Default: true. */
  autoSetup?: boolean;
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
