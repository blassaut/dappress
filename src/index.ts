/// <reference types="cypress" preserve="true" />

// The plugin's entry point. configureDappress() resolves the options,
// downloads MetaMask, loads it into the browser Cypress launches (from the
// wallet cache when asked), and registers the tasks behind the cy.* commands.

import { resolveOptions, publicOptions } from './config';
import { captureDebuggerUrl } from './browser';
import { prepareExtension } from './download';
import { prepareCachedWallet, installCachedWallet } from './wallet-cache';
import { createTasks } from './actions';
import { loadProfile } from './wallet-profile';
import { addressOf } from './keys';
import { browserLogArgs, watchEventLoop } from './debug';
import type { DappressOptions } from './types';

export type { DappressOptions, Network, WalletSetup } from './types';
export type { Profile } from './wallet-profile';

/**
 * Wire Dappress into a Cypress project. Call it from setupNodeEvents:
 *
 *   setupNodeEvents(on, config) {
 *     return configureDappress(on, config);
 *   }
 *
 * It loads the MetaMask extension into the browser Cypress launches, and
 * registers the tasks behind the cy.* commands from 'dappress/support'.
 */
export function configureDappress(
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  userOptions: DappressOptions = {},
): Cypress.PluginConfigOptions {
  const options = resolveOptions(userOptions, config);
  watchEventLoop();

  // A mock wallet lives in the page: no extension, no browser hooks, no task.
  // The profile it replays goes to the browser side with the options
  if (options.mock) {
    const profile = loadProfile(options.mock);
    const chains = Object.keys(options.chains);
    console.log(
      `[dappress] Mock of ${profile.wallet.name} ${profile.wallet.version}: keys at ${options.rpcUrl}${chains.length ? `, chains ${chains.join(', ')}` : ''}`,
    );
    // The one task: the address of a key cy.importAccount() gives, which the mock lets the RPC endpoint act for
    on('task', { 'dappress:addressOf': (privateKey: string) => addressOf(privateKey) });
    config.expose = { ...config.expose, dappress: publicOptions(options, profile) };
    return config;
  }

  if (config.chromeWebSecurity === false) {
    console.warn('[dappress] chromeWebSecurity is off: MetaMask cannot start its snaps, so adding or importing an account will hang');
  }

  // A cached wallet gets its requests in MetaMask's popup window, which headless Chrome doesn't open
  const usesCache = (browser: Cypress.Browser) => options.cache && !browser.isHeadless;

  // Import the wallet into the cache before the run, out of the time Cypress allows a browser to come up
  on('before:run', async ({ browser }) => {
    if (browser && usesCache(browser)) await prepareCachedWallet({ browserPath: browser.path, extensionDir: await prepareExtension(options), options });
  });

  on('before:browser:launch', async (browser, launchOptions) => {
    if (browser.family !== 'chromium') {
      throw new Error(`[dappress] MetaMask is a Chromium extension; ${browser.name} is not supported`);
    }
    const extensionDir = await prepareExtension(options);
    launchOptions.extensions.push(extensionDir);
    launchOptions.args.push(...browserLogArgs());
    if (browser.isHeadless) {
      // Cypress leaves extensions out of a headless launch, so ask Chrome directly
      launchOptions.args.push(`--load-extension=${extensionDir}`);
      if (options.cache) console.warn('[dappress] The wallet cache needs a headed browser: importing the wallet in this run instead');
    }
    if (usesCache(browser)) {
      const cachedWallet = await prepareCachedWallet({ browserPath: browser.path, extensionDir, options });
      await installCachedWallet(cachedWallet, browser, config.isTextTerminal);
    }
    return launchOptions;
  });
  captureDebuggerUrl(on);
  on('task', createTasks(options));

  // Non-sensitive settings the browser side reads with Cypress.expose()
  config.expose = { ...config.expose, dappress: publicOptions(options) };
  return config;
}
