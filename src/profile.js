// Onboard the wallet once, in a browser of our own, and keep the resulting
// profile. Each Cypress run then starts from a copy of it, with the wallet
// imported but nothing else: no connected site, no added network.

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const metamask = require('./metamask');
const { findExtensionId, getHomePage } = require('./metamask-pages');

// One build at a time: Cypress calls before:browser:launch again when the
// browser is slow to connect, and two builds on one profile would collide
const builds = new Map();

/** The cached profile for these options, built on first use. */
function prepareProfile({ browserPath, extensionDir, options }) {
  const key = crypto.createHash('sha256').update([options.metamaskVersion, options.seedPhrase, options.password, options.backupAndSync].join('|')).digest('hex').slice(0, 16);
  if (!builds.has(key)) builds.set(key, buildProfile(path.join(options.cacheDir, 'profiles', key), { browserPath, extensionDir, options }));
  return builds.get(key);
}

async function buildProfile(dir, { browserPath, extensionDir, options }) {
  if (fs.existsSync(path.join(dir, 'ready'))) return dir;

  console.log('[dappress] Importing the wallet once, into a cached profile…');
  await fs.promises.rm(dir, { recursive: true, force: true });
  const launch = () =>
    puppeteer.launch({
      executablePath: browserPath,
      headless: false,
      userDataDir: dir,
      // No sandbox: Ubuntu 23.10+ (GitHub's ubuntu-latest) blocks the user
      // namespaces it needs, and this browser only imports a test wallet
      args: [`--load-extension=${extensionDir}`, `--disable-extensions-except=${extensionDir}`, '--no-first-run', '--no-sandbox'],
    });

  await withMetaMask(launch, (home) => metamask.onboard(home, options));
  // Reopen the profile: the wallet must now be there, locked, with no onboarding left
  await withMetaMask(launch, async (home) => {
    const state = await metamask.walletState(home);
    if (state !== 'locked') throw new Error(`[dappress] The cached profile did not keep the wallet: MetaMask is ${state} at ${home.url()}`);
    await metamask.unlock(home, options);
  });
  fs.writeFileSync(path.join(dir, 'ready'), '');
  return dir;
}

// MetaMask persists its state a moment after the last screen; leave it that moment before closing
async function withMetaMask(launch, action) {
  const browser = await launch();
  try {
    await action(await getHomePage(browser, await findExtensionId(browser)));
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } finally {
    await browser.close();
  }
}

// Where Cypress is about to create the browser profile:
// <app data>/Cypress/cy/<env>/browsers/<name>-<channel>/run-<pid of the Cypress process>,
// or .../interactive in open mode. The pid is our parent's: Cypress runs
// setupNodeEvents in a child process. Returns null when it can't be found.
function cypressProfileDir(browser, isTextTerminal) {
  const appData = [
    path.join(os.homedir(), 'Library', 'Application Support'),
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    process.env.APPDATA,
  ].filter(Boolean);
  const cypressData = appData.map((dir) => path.join(dir, 'Cypress', 'cy')).find((dir) => fs.existsSync(dir));
  if (!cypressData) return null;
  const env = ['production', 'development'].find((name) => fs.existsSync(path.join(cypressData, name)));
  if (!env) return null;
  return path.join(cypressData, env, 'browsers', `${browser.name}-${browser.channel}`, isTextTerminal ? `run-${process.ppid}` : 'interactive');
}

/**
 * Copy MetaMask's data from the cached profile into the profile Cypress is
 * about to launch. Returns false when that profile can't be located; the
 * wallet is then imported during the run instead.
 */
async function installProfile(profileDir, browser, isTextTerminal) {
  const userDataDir = cypressProfileDir(browser, isTextTerminal);
  if (!userDataDir) {
    console.warn('[dappress] Could not locate the Cypress browser profile; importing the wallet in this run instead');
    return false;
  }
  for (const entry of metamaskData(profileDir)) {
    await fs.promises.cp(path.join(profileDir, entry), path.join(userDataDir, entry), { recursive: true });
  }
  return true;
}

// Where Chrome keeps an extension's storage: chrome.storage.local and IndexedDB
function metamaskData(profileDir) {
  const base = path.join(profileDir, 'Default');
  const entries = ['Local Extension Settings', 'IndexedDB'];
  return entries
    .filter((entry) => fs.existsSync(path.join(base, entry)))
    .flatMap((entry) => fs.readdirSync(path.join(base, entry)).map((name) => path.join('Default', entry, name)));
}

module.exports = { prepareProfile, installProfile };
