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

function isHomeRoute(url) {
  return url.includes('/notification.html') && /notification\.html(#\/?)?$/.test(url);
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
    // A page still loading or redirecting loses its execution context while its
    // title is read; not MetaMask yet, findExtensionId looks again
    try {
      const page = await target.page();
      return (await page.title()).startsWith('MetaMask');
    } catch {
      return false;
    }
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

/** The pages open where dapp requests show up: the side panel, a popup. */
async function getRequestPages(browser, extensionId) {
  const pages = [];
  for (const pathname of CONFIRMATION_PATHS) {
    for (const target of pagesOf(browser, extensionId, pathname)) {
      const page = await target.page();
      if (page) pages.push(pathname === '/notification.html' ? await withUsableWindow(page) : page);
    }
  }
  return pages;
}

/**
 * The page a dapp request is shown on. Waits for the popup to open, or takes
 * the side panel. A popup still on its home route is one closing after the
 * previous request, or one that hasn't routed to the request yet: skipped.
 */
async function getConfirmationPage(browser, extensionId, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const pathname of CONFIRMATION_PATHS) {
      const [target] = pagesOf(browser, extensionId, pathname).filter((candidate) => !isHomeRoute(candidate.url()));
      if (target) return pathname === '/notification.html' ? withUsableWindow(await target.page()) : target.page();
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

// MetaMask asks Chrome for a 400x620 popup. Under Xvfb on a GitHub runner the
// window it gets is 1x1: nothing is laid out, the pane of a confirmation that
// must be read to the end has no height, so it can never be scrolled there and
// its Confirm button stays disabled. The popup is given its size back first.
const POPUP = { width: 400, height: 620 };

async function withUsableWindow(page) {
  const session = await page.target().createCDPSession();
  try {
    const { windowId, bounds } = await session.send('Browser.getWindowForTarget');
    if (bounds.windowState === 'normal' && bounds.width >= 200 && bounds.height >= 200) return page;
    console.log(`[dappress] MetaMask's popup is ${bounds.width}x${bounds.height} (${bounds.windowState}); resizing it to ${POPUP.width}x${POPUP.height}`);
    if (bounds.windowState !== 'normal') await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await session.send('Browser.setWindowBounds', { windowId, bounds: { ...POPUP } });
    // Let the page lay itself out at its new size before anything is looked for in it
    await sleep(300);
  } catch (error) {
    console.warn(`[dappress] Could not check the popup window's size: ${error.message}`);
  } finally {
    await session.detach().catch(() => {});
  }
  return page;
}

module.exports = { findExtensionId, getHomePage, getRequestPages, getConfirmationPage, withUsableWindow };
