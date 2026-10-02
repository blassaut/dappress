// The Node side of every cy.* command, registered as Cypress tasks. Each
// action gets a Puppeteer browser connected to the Cypress browser, finds the
// MetaMask page it needs and drives it through src/metamask.js.

const { withBrowser } = require('./browser');
const metamask = require('./metamask');
const { findExtensionId, getHomePage, getConfirmationPage } = require('./metamask-pages');

function createTasks(options) {
  // Found once: the browser is the same for the whole run
  let extensionId;

  async function metamaskId(browser) {
    extensionId = extensionId || (await findExtensionId(browser));
    return extensionId;
  }

  /** Onboard the wallet or unlock it, so the dapp can talk to it. Safe to call repeatedly. */
  async function setupWallet(browser) {
    const home = await getHomePage(browser, await metamaskId(browser));
    const state = await metamask.walletState(home);
    console.log(`[dappress] MetaMask is ${state}`);
    if (state === 'onboarding') await metamask.onboard(home, options);
    if (state === 'locked') await metamask.unlock(home, options);
    if (state === 'unknown') throw new Error(`[dappress] Unexpected MetaMask screen at ${home.url()}`);
    await home.close();
    return state;
  }

  /** A task that drives the wallet's own screens, from its full-screen page. */
  const onHomePage = (flow) => async (browser, argument) => {
    const home = await getHomePage(browser, await metamaskId(browser));
    try {
      await home.bringToFront();
      return await flow(home, argument);
    } finally {
      await home.close();
    }
  };

  /** Approve the prompt a network change raised: "Add network" or the permission to switch. */
  async function approveNetworkChange(browser) {
    const page = await getConfirmationPage(browser, await metamaskId(browser), options.timeout);
    await metamask.approveNetworkChange(page, options.timeout);
  }

  /** The task for a decision: find the confirmation, press its button. */
  const decide = (decision) => async (browser) => {
    const page = await getConfirmationPage(browser, await metamaskId(browser), options.timeout);
    await metamask.decide(decision, page, options.timeout);
  };

  const actions = {
    setupWallet,
    approveNetworkChange,
    addAccount: onHomePage(metamask.addAccount),
    switchAccount: onHomePage(metamask.switchAccount),
    importAccount: onHomePage(metamask.importAccount),
  };
  for (const decision of Object.keys(metamask.decisions)) actions[decision] = decide(decision);

  // cy.task() needs a value back: null when the action has nothing to say
  const asTask = (action) => async (argument) => (await withBrowser((browser) => action(browser, argument))) ?? null;
  return Object.fromEntries(Object.entries(actions).map(([name, action]) => [`dappress:${name}`, asTask(action)]));
}

module.exports = { createTasks };
