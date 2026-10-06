// The wallet cache (the `cache` option): the wallet is imported once, in a
// browser of our own, and the browser profile that holds it is kept. Each
// Cypress run then starts from a copy of it, with the wallet imported but
// nothing else: no connected site, no added network. Not to be confused with
// the wallet profiles of scripts/profile.ts, which record what a dapp sees.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import * as metamask from './metamask';
import { findExtensionId, getHomePage } from './metamask-pages';
import { sleep } from './page-helpers';
import type { ResolvedOptions } from './types';

type CacheBuild = { browserPath: string; extensionDir: string; options: ResolvedOptions };

// One build at a time: Cypress calls before:browser:launch again when the
// browser is slow to connect, and two builds of one cache would collide
const builds = new Map<string, Promise<string>>();

/** The cached wallet for these options, its browser profile built on first use. Yields the profile's directory. */
export function prepareCachedWallet({ browserPath, extensionDir, options }: CacheBuild): Promise<string> {
  const key = crypto
    .createHash('sha256')
    .update([options.metamaskVersion, options.seedPhrase, options.password, options.backupAndSync].join('|'))
    .digest('hex')
    .slice(0, 16);
  let build = builds.get(key);
  if (!build) {
    build = buildCache(path.join(options.cacheDir, 'profiles', key), { browserPath, extensionDir, options });
    builds.set(key, build);
  }
  return build;
}

async function buildCache(dir: string, { browserPath, extensionDir, options }: CacheBuild): Promise<string> {
  if (fs.existsSync(path.join(dir, 'ready'))) return dir;

  console.log('[dappress] Importing the wallet once, into the wallet cache…');
  await fs.promises.rm(dir, { recursive: true, force: true });
  const launch = () =>
    puppeteer.launch({
      executablePath: browserPath,
      headless: false,
      userDataDir: dir,
      args: [
        `--load-extension=${extensionDir}`,
        `--disable-extensions-except=${extensionDir}`,
        '--no-first-run',
        // No sandbox on Linux: Ubuntu 23.10+ (GitHub's ubuntu-latest) blocks the
        // user namespaces it needs, and this browser only imports a test wallet
        ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
      ],
    });

  await withMetaMask(launch, (home) => metamask.onboard(home, options));
  // Reopen the profile: the wallet must now be there, locked, with no onboarding left
  await withMetaMask(launch, async (home) => {
    const state = await metamask.walletState(home);
    if (state !== 'locked') throw new Error(`[dappress] The wallet cache did not keep the wallet: MetaMask is ${state} at ${home.url()}`);
    await metamask.unlock(home, options);
  });
  fs.writeFileSync(path.join(dir, 'ready'), '');
  return dir;
}

// MetaMask persists its state a moment after the last screen; leave it that moment before closing
async function withMetaMask(launch: () => Promise<Browser>, action: (home: Page) => Promise<void>): Promise<void> {
  const browser = await launch();
  try {
    const home = await getHomePage(browser, await findExtensionId(browser));
    await keepInFront(browser, home);
    await action(home);
    await sleep(3000);
  } finally {
    await browser.close();
  }
}

// Chrome stops rendering a tab that isn't the active one, and Puppeteer waits
// on rendering to find an element or to click it: a hidden tab never answers.
// So the home page is made the active tab, and again whenever MetaMask opens
// a tab of its own, as it does for its onboarding right after the install.
async function keepInFront(browser: Browser, home: Page): Promise<void> {
  const toFront = () => home.bringToFront().catch(() => {});
  await toFront();
  browser.on('targetcreated', (target) => {
    if (target.type() !== 'page') return;
    toFront();
    setTimeout(toFront, 500);
  });
}

// Where Cypress is about to create the browser profile:
// <app data>/Cypress/cy/<env>/browsers/<name>-<channel>/run-<pid of the Cypress process>,
// or .../interactive in open mode. The pid is our parent's: Cypress runs
// setupNodeEvents in a child process. Returns null when it can't be found.
function cypressProfileDir(browser: Cypress.Browser, isTextTerminal?: boolean): string | null {
  const appData = [
    path.join(os.homedir(), 'Library', 'Application Support'),
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    process.env.APPDATA,
  ].filter((dir): dir is string => Boolean(dir));
  const cypressData = appData.map((dir) => path.join(dir, 'Cypress', 'cy')).find((dir) => fs.existsSync(dir));
  if (!cypressData) return null;
  const env = ['production', 'development'].find((name) => fs.existsSync(path.join(cypressData, name)));
  if (!env) return null;
  return path.join(cypressData, env, 'browsers', `${browser.name}-${browser.channel}`, isTextTerminal ? `run-${process.ppid}` : 'interactive');
}

/**
 * Copy MetaMask's data from the cached wallet's profile into the profile
 * Cypress is about to launch. Returns false when that profile can't be
 * located; the wallet is then imported during the run instead.
 */
export async function installCachedWallet(cacheDir: string, browser: Cypress.Browser, isTextTerminal?: boolean): Promise<boolean> {
  const userDataDir = cypressProfileDir(browser, isTextTerminal);
  if (!userDataDir) {
    console.warn('[dappress] Could not locate the Cypress browser profile; importing the wallet in this run instead');
    return false;
  }
  for (const entry of metamaskData(cacheDir)) {
    await fs.promises.cp(path.join(cacheDir, entry), path.join(userDataDir, entry), { recursive: true });
  }
  return true;
}

// Where Chrome keeps an extension's storage: chrome.storage.local and IndexedDB
function metamaskData(profileDir: string): string[] {
  const base = path.join(profileDir, 'Default');
  const entries = ['Local Extension Settings', 'IndexedDB'];
  return entries
    .filter((entry) => fs.existsSync(path.join(base, entry)))
    .flatMap((entry) => fs.readdirSync(path.join(base, entry)).map((name) => path.join('Default', entry, name)));
}
