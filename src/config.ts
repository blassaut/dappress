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
import { chainsSeen } from './mock-wallet';

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
  // None: the mock starts on mainnet. A chain its profile saw the wallet on: the one its user set, Phantom's Testnet mode
  mockChain: null as string | null,
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
    mockChain: process.env.DAPPRESS_MOCK_CHAIN || env.DAPPRESS_MOCK_CHAIN,
    rpcUrl: process.env.DAPPRESS_RPC_URL || env.DAPPRESS_RPC_URL,
  };

  const options = { ...DEFAULTS, ...userOptions, ...loadWalletSetup(cypressConfig.projectRoot) };
  for (const [key, value] of Object.entries(fromEnv) as [keyof typeof fromEnv, string | undefined][]) {
    if (value) options[key] = value;
  }
  const seedPhrase = options.seedPhrase || newWallet();
  // The wallet cache keeps a wallet across runs: nothing to keep of one made for this run
  const cache = options.cache && Boolean(options.seedPhrase);
  if (options.mockChain && !options.mock) console.warn('[dappress] mockChain is for a mock: the real MetaMask starts on the chain it is on');
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
  const exposed: PublicOptions = { metamaskVersion: options.metamaskVersion, autoSetup: options.autoSetup, network: options.network, chains: options.chains };
  if (mockProfile) {
    exposed.mock = { profile: mockProfile, rpcUrl: options.rpcUrl, chains: options.chains, timeout: options.timeout };
    if (options.mockChain) exposed.mock.chain = mockChain(options.mockChain, mockProfile);
  }
  return exposed;
}

/**
 * The chain a mock starts on, as its user set it in the wallet: mainnet, where
 * a mock starts without the option, or a chain its profile saw the wallet on.
 * The mock never stands on a chain the wallet was not seen on. A chain id is
 * in hex, as eth_chainId answers it: a decimal one is refused, with its hex.
 */
export function mockChain(chain: string, profile: Profile): string {
  const asked = String(chain).trim().toLowerCase();
  const takes = [...new Set([MAINNET, ...chainsSeen(profile)])];
  if (/^\d+$/.test(asked))
    throw new Error(`[dappress] mockChain ${asked}: a chain id is expected in hex, as eth_chainId answers it: 0x${BigInt(asked).toString(16)}`);
  if (takes.includes(asked)) return asked;
  const wallet = `${profile.wallet.name} ${profile.wallet.version}`;
  throw new Error(
    `[dappress] mockChain ${String(chain)}: the ${wallet} profile never saw the wallet on that chain, so its mock cannot start there. It takes ${takes.join(', ')}`,
  );
}

const MAINNET = '0x1';

/**
 * What to say of a mock started on `chain` whose reads and transactions go to
 * the keys' endpoint, as no `chains` entry names an RPC for that chain, while
 * that endpoint is on another chain. Nothing when they agree, or when the
 * endpoint did not say.
 */
export function keysOnAnotherChain(chain: string, keysChain: string | undefined, rpcUrl: string): string | undefined {
  if (!keysChain || keysChain.toLowerCase() === chain) return undefined;
  return (
    `[dappress] The mock starts on chain ${chain}, and the chains option names no RPC for it: its reads and transactions go to ${rpcUrl}, which is on chain ${keysChain.toLowerCase()}. ` +
    `Start Anvil with --chain-id ${BigInt(chain).toString()}, or as a fork of that chain, or name its RPC in the chains option`
  );
}
