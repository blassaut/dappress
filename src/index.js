const { resolveOptions, publicOptions } = require('./config');
const { captureDebuggerUrl } = require('./browser');
const { prepareExtension } = require('./download');
const { createTasks } = require('./actions');

/**
 * Wire DappPress into a Cypress project. Call it from setupNodeEvents:
 *
 *   setupNodeEvents(on, config) {
 *     return configureDappPress(on, config);
 *   }
 *
 * It loads the MetaMask extension into the browser Cypress launches, and
 * registers the tasks behind the cy.* commands from 'dappress/support'.
 */
function configureDappPress(on, config, userOptions = {}) {
  const options = resolveOptions(userOptions, config);

  on('before:browser:launch', async (browser, launchOptions) => {
    if (browser.family !== 'chromium') {
      throw new Error(`[dappress] MetaMask is a Chromium extension; ${browser.name} is not supported`);
    }
    launchOptions.extensions.push(await prepareExtension(options));
    return launchOptions;
  });
  captureDebuggerUrl(on);
  on('task', createTasks(options));

  // Non-sensitive settings the browser side reads with Cypress.expose()
  config.expose = { ...config.expose, dappress: publicOptions(options) };
  return config;
}

module.exports = { configureDappPress };
