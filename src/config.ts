// The plugin's options, from their three sources: the environment (or the
// Cypress env block) for secrets and the MetaMask version, the wallet setup
// file for the network, the argument of configureDappress() for the rest.
// publicOptions() is the subset the browser side may read: no secret in it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import type { DappressOptions, Network, PublicOptions, ResolvedOptions, WalletSetup } from './types';
import type { Profile } from './wallet-profile';

export const DEFAULTS = {
  metamaskVersion: '13.50.0',
  // A SHA-256 to accept the MetaMask archive with. None: the one known for the version, if any
  metamaskChecksum: null as string | null,
  // None: a new wallet is made for each run. A phrase known to others is not
  // blank, since MetaMask restores the accounts saved for it elsewhere.
  seedPhrase: null as string | null,
  password: 'Tester@1234',
  // The network cy.connectToDapp() moves the dapp onto, as a wallet_addEthereumChain parameter; none by default
  network: null as Network | null,
  // MetaMask's backup and sync saves the accounts and contacts of a seed phrase
  // and restores them on other installs. Off, a test's accounts don't come back.
  backupAndSync: false,
  // Run cy.setupMetaMask() automatically before the first test of each spec
  autoSetup: true,
  // Import the wallet once and reuse the profile across runs (keeps the vault under cacheDir)
  cache: false,
  // How long to wait for MetaMask to show a confirmation after a dapp request (ms)
  timeout: 20000,
  cacheDir: path.join(os.homedir(), '.cache', 'dappress'),
  // None: the real MetaMask. A wallet's name or a profile's path: its mock, in place of the extension
  mock: null as string | null,
  // The endpoint that holds the mock's keys, and stands for a chain it has no RPC for: Anvil's default
  rpcUrl: 'http://127.0.0.1:8545',
  // The RPC of each chain, for the mock: none beyond what the dapp gives as it adds a chain
  chains: {} as Record<string, string>,
};

/**
 * The SHA-256 of the archive of each MetaMask release the conformance suite
 * ran against, taken from the archive it downloaded. An archive of one of
 * these versions with another digest is refused.
 */
export const METAMASK_CHECKSUMS: Record<string, string> = {
  '13.50.0': 'b759caca275dec1a10edfebb9d1de1d26589a92104d8b0523ec442930e20e47c',
  '13.49.0': '7ba00bfe4fe8b0ffb27be1e8fc06506248f1b888cb4f2e5e5e8b1c37f461f262',
};

// A .ts file loads when the Cypress config is itself in TypeScript
const WALLET_SETUP_FILES = ['cypress/wallet.setup.ts', 'cypress/wallet.setup.js'];

/**
 * The plugin options, in order of precedence: environment variables, the
 * Cypress `env` block (cypress.env.json), the wallet setup file
 * (cypress/wallet.setup.ts or .js), the options given to configureDappress(),
 * then the defaults above.
 */
export function resolveOptions(
  userOptions: DappressOptions = {},
  cypressConfig: Partial<Pick<Cypress.PluginConfigOptions, 'env' | 'projectRoot'>> = {},
): ResolvedOptions {
  const env = cypressConfig.env || {};
  const fromEnv = {
    metamaskVersion: process.env.DAPPRESS_METAMASK_VERSION || env.DAPPRESS_METAMASK_VERSION,
    metamaskChecksum: process.env.DAPPRESS_METAMASK_CHECKSUM || env.DAPPRESS_METAMASK_CHECKSUM,
    seedPhrase: process.env.DAPPRESS_SEED_PHRASE || env.DAPPRESS_SEED_PHRASE,
    password: process.env.DAPPRESS_PASSWORD || env.DAPPRESS_PASSWORD,
    mock: process.env.DAPPRESS_MOCK || env.DAPPRESS_MOCK,
    rpcUrl: process.env.DAPPRESS_RPC_URL || env.DAPPRESS_RPC_URL,
  };

  const options = { ...DEFAULTS, ...userOptions, ...loadWalletSetup(cypressConfig.projectRoot) };
  for (const [key, value] of Object.entries(fromEnv) as [keyof typeof fromEnv, string | undefined][]) {
    if (value) options[key] = value;
  }
  const seedPhrase = options.seedPhrase || newWallet();
  // The wallet cache keeps a wallet across runs: nothing to keep of one made for this run
  const cache = options.cache && Boolean(options.seedPhrase);
  if (options.cache && !cache) console.warn('[dappress] The wallet cache needs a seed phrase of your own: importing the wallet in this run instead');
  const metamaskChecksum = options.metamaskChecksum || METAMASK_CHECKSUMS[options.metamaskVersion] || null;
  return { ...options, seedPhrase, cache, metamaskChecksum };
}

/** No seed phrase was given: make one for this run. It is never written anywhere. */
function newWallet(): string {
  console.log('[dappress] No seed phrase configured: using a new wallet for this run');
  return generateMnemonic(wordlist);
}

/** The project's wallet setup file: { seedPhrase?, network? }. */
function loadWalletSetup(projectRoot = process.cwd()): WalletSetup {
  const file = WALLET_SETUP_FILES.map((name) => path.join(projectRoot, name)).find((candidate) => fs.existsSync(candidate));
  if (!file) return {};
  // The file is the project's, found at run time: there is nothing to import statically
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require(file);
  const setup: WalletSetup = loaded.default || loaded; // `export default` or `module.exports`
  const unknown = Object.keys(setup).filter((key) => !['seedPhrase', 'network'].includes(key));
  if (unknown.length) throw new Error(`[dappress] Unknown keys in ${path.basename(file)}: ${unknown.join(', ')}`);
  return setup;
}

/** The subset of options that is safe to expose to the browser side (no secrets). */
export function publicOptions(options: ResolvedOptions, mockProfile?: Profile): PublicOptions {
  const exposed: PublicOptions = { metamaskVersion: options.metamaskVersion, autoSetup: options.autoSetup, network: options.network };
  if (mockProfile) exposed.mock = { profile: mockProfile, rpcUrl: options.rpcUrl, chains: options.chains, timeout: options.timeout };
  return exposed;
}
