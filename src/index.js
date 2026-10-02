const { resolveOptions, publicOptions } = require('./config');
const { captureDebuggerUrl } = require('./browser');
const { prepareExtension } = require('./download');
const { prepareProfile, installProfile } = require('./profile');
const { createTasks } = require('./actions');

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
function configureDappress(on, config, userOptions = {}) {
  const options = resolveOptions(userOptions, config);
  if (config.chromeWebSecurity === false) {
    console.warn('[dappress] chromeWebSecurity is off: MetaMask cannot start its snaps, so adding or importing an account will hang');
  }

  // A cached wallet gets its requests in MetaMask's popup window, which headless Chrome doesn't open
  const usesCache = (browser) => options.cache && !browser.isHeadless;

  // Build the wallet profile before the run, out of the time Cypress allows a browser to come up
  on('before:run', async ({ browser }) => {
    if (browser && usesCache(browser)) await prepareProfile({ browserPath: browser.path, extensionDir: await prepareExtension(options), options });
  });

  on('before:browser:launch', async (browser, launchOptions) => {
    if (browser.family !== 'chromium') {
      throw new Error(`[dappress] MetaMask is a Chromium extension; ${browser.name} is not supported`);
    }
    const extensionDir = await prepareExtension(options);
    launchOptions.extensions.push(extensionDir);
    if (browser.isHeadless) {
      // Cypress leaves extensions out of a headless launch, so ask Chrome directly
      launchOptions.args.push(`--load-extension=${extensionDir}`);
      if (options.cache) console.warn('[dappress] The wallet cache needs a headed browser: importing the wallet in this run instead');
    }
    if (usesCache(browser)) {
      const profileDir = await prepareProfile({ browserPath: browser.path, extensionDir, options });
      await installProfile(profileDir, browser, config.isTextTerminal);
    }
    return launchOptions;
  });
  captureDebuggerUrl(on);
  on('task', createTasks(options));

  // Non-sensitive settings the browser side reads with Cypress.expose()
  config.expose = { ...config.expose, dappress: publicOptions(options) };
  return config;
}

module.exports = { configureDappress };
