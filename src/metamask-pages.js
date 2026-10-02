// Find MetaMask's pages in the browser Cypress launched: the full-screen home
// page, and the surface where dapp requests show up. On Chrome that surface
// is the side panel when it is open, and the "MetaMask Dialog" popup otherwise.

const { sleep } = require('./page-helpers');

const HOME_PATH = '/home.html';
const CONFIRMATION_PATHS = ['/notification.html', '/sidepanel.html'];

function extensionIdOf(url) {
  const match = /^chrome-extension:\/\/([a-z]{32})\//.exec(url);
  return match ? match[1] : null;
}

function pagesOf(browser, extensionId, pathname) {
  return browser
    .targets()
    .filter((target) => target.type() === 'page' && target.url().startsWith(`chrome-extension://${extensionId}${pathname}`));
}

/**
 * MetaMask's extension id. Cypress loads its own extension in headed
 * Chromium browsers, so the id is the one whose home page is titled "MetaMask".
 */
async function findExtensionId(browser, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ids = new Set(browser.targets().map((target) => extensionIdOf(target.url())).filter(Boolean));
    for (const id of ids) {
      if (await isMetaMask(browser, id)) return id;
    }
    await sleep(500);
  }
  throw new Error('[dappress] MetaMask extension not found in the browser. Is it loaded in before:browser:launch?');
}

async function isMetaMask(browser, extensionId) {
  const [target] = pagesOf(browser, extensionId, HOME_PATH);
  if (target) {
    const page = await target.page();
    return (await page.title()).startsWith('MetaMask');
  }
  const page = await browser.newPage();
  try {
    const response = await page.goto(`chrome-extension://${extensionId}${HOME_PATH}`, { waitUntil: 'domcontentloaded' });
    return Boolean(response && response.ok()) && (await page.title()).startsWith('MetaMask');
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

/** The full-screen MetaMask page, opened if it isn't already. */
async function getHomePage(browser, extensionId) {
  const [target] = pagesOf(browser, extensionId, HOME_PATH);
  if (target) return target.page();
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}${HOME_PATH}`, { waitUntil: 'domcontentloaded' });
  return page;
}

/** The page a dapp request is shown on. Waits for the popup to open, or takes the side panel. */
async function getConfirmationPage(browser, extensionId, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const pathname of CONFIRMATION_PATHS) {
      const [target] = pagesOf(browser, extensionId, pathname);
      if (target) return target.page();
    }
    await sleep(250);
  }
  const seen = browser
    .targets()
    .filter((target) => extensionIdOf(target.url()) === extensionId)
    .map((target) => `${target.type()} ${target.url()}`)
    .join(', ');
  throw new Error(
    `[dappress] MetaMask showed no confirmation within ${timeout}ms. Did the dapp send a request? MetaMask pages seen: ${seen || 'none'}`,
  );
}

module.exports = { findExtensionId, getHomePage, getConfirmationPage };
