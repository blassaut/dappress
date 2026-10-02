const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateMnemonic } = require('@scure/bip39');
const { wordlist } = require('@scure/bip39/wordlists/english');

const DEFAULTS = {
  metamaskVersion: '13.50.0',
  // None: a new wallet is made for each run. A phrase known to others is not
  // blank, since MetaMask restores the accounts saved for it elsewhere.
  seedPhrase: null,
  password: 'Tester@1234',
  // The network cy.connectToDapp() moves the dapp onto, as a wallet_addEthereumChain parameter; none by default
  network: null,
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
};

// A .ts file loads when the Cypress config is itself in TypeScript
const WALLET_SETUP_FILES = ['cypress/wallet.setup.ts', 'cypress/wallet.setup.js'];

/**
 * The plugin options, in order of precedence: environment variables, the
 * Cypress `env` block (cypress.env.json), the wallet setup file
 * (cypress/wallet.setup.ts or .js), the options given to configureDappress(),
 * then the defaults above.
 */
function resolveOptions(userOptions = {}, cypressConfig = {}) {
  const env = cypressConfig.env || {};
  const fromEnv = {
    metamaskVersion: process.env.DAPPRESS_METAMASK_VERSION || env.DAPPRESS_METAMASK_VERSION,
    seedPhrase: process.env.DAPPRESS_SEED_PHRASE || env.DAPPRESS_SEED_PHRASE,
    password: process.env.DAPPRESS_PASSWORD || env.DAPPRESS_PASSWORD,
  };

  const options = { ...DEFAULTS, ...userOptions, ...loadWalletSetup(cypressConfig.projectRoot) };
  for (const [key, value] of Object.entries(fromEnv)) {
    if (value) options[key] = value;
  }
  if (!options.seedPhrase) useNewWallet(options);
  return options;
}

/** No seed phrase was given: make one for this run. It is never written anywhere. */
function useNewWallet(options) {
  options.seedPhrase = generateMnemonic(wordlist);
  console.log('[dappress] No seed phrase configured: using a new wallet for this run');
  if (options.cache) {
    console.warn('[dappress] The profile cache needs a seed phrase of your own: importing the wallet in this run instead');
    options.cache = false;
  }
}

/** The project's wallet setup file: { seedPhrase?, network? }. */
function loadWalletSetup(projectRoot = process.cwd()) {
  const file = WALLET_SETUP_FILES.map((name) => path.join(projectRoot, name)).find((candidate) => fs.existsSync(candidate));
  if (!file) return {};
  const loaded = require(file);
  const setup = loaded.default || loaded; // `export default` or `module.exports`
  const unknown = Object.keys(setup).filter((key) => !['seedPhrase', 'network'].includes(key));
  if (unknown.length) throw new Error(`[dappress] Unknown keys in ${path.basename(file)}: ${unknown.join(', ')}`);
  return setup;
}

/** The subset of options that is safe to expose to the browser side (no secrets). */
function publicOptions(options) {
  return { metamaskVersion: options.metamaskVersion, autoSetup: options.autoSetup, network: options.network };
}

module.exports = { DEFAULTS, resolveOptions, publicOptions };
