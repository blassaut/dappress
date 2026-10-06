// Find MetaMask's pages in the browser Cypress launched: the full-screen home
// page, and the surface where dapp requests show up. On Chrome that surface
// is the side panel when it is open, and the "MetaMask Dialog" popup otherwise.

import type { Browser, Page, Target } from 'puppeteer-core';
import { sleep } from './page-helpers';

const HOME_PATH = '/home.html';
const CONFIRMATION_PATHS = ['/notification.html', '/sidepanel.html'];

function extensionIdOf(url: string): string | null {
  const match = /^chrome-extension:\/\/([a-z]{32})\//.exec(url);
  return match ? match[1] : null;
}

// A popup or a side panel on its home route shows no request: it has not
// routed to one yet, the popup is closing, or the request is shown in another
// side panel (Chrome 155 on Linux keeps one on the wallet's home as well)
function isHomeRoute(url: string): boolean {
  return /(notification|sidepanel)\.html(#\/?)?$/.test(url);
}

function pagesOf(browser: Browser, extensionId: string, pathname: string): Target[] {
  return browser.targets().filter((target) => target.type() === 'page' && target.url().startsWith(`chrome-extension://${extensionId}${pathname}`));
}

/**
 * The pages open where dapp requests show up, the side panel and the popup,
 * with the popup given a usable window. A target closing while its page is
 * taken has none, and is left out.
 */
export async function getRequestPages(browser: Browser, extensionId: string): Promise<Page[]> {
  const pages: Page[] = [];
  for (const pathname of CONFIRMATION_PATHS) {
    for (const target of pagesOf(browser, extensionId, pathname)) {
      const page = await target.page().catch(() => null);
      if (page && !page.isClosed()) pages.push(pathname === '/notification.html' ? await withUsableWindow(page) : page);
    }
  }
  return pages;
}

/**
 * MetaMask's extension id. Cypress loads its own extension in headed
 * Chromium browsers, so the id is the one whose home page is titled "MetaMask".
 */
export async function findExtensionId(browser: Browser, timeout = 30000): Promise<string> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ids = new Set(
      browser
        .targets()
        .map((target) => extensionIdOf(target.url()))
        .filter((id) => id !== null),
    );
    for (const id of ids) {
      if (await isMetaMask(browser, id)) return id;
    }
    await sleep(500);
  }
  throw new Error('[dappress] MetaMask extension not found in the browser. Is it loaded in before:browser:launch?');
}

async function isMetaMask(browser: Browser, extensionId: string): Promise<boolean> {
  const [target] = pagesOf(browser, extensionId, HOME_PATH);
  if (target) {
    // A page still loading or redirecting loses its execution context while its
    // title is read; not MetaMask yet, findExtensionId looks again
    try {
      const page = await pageOf(target);
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

// A target of type "page" has a page; Puppeteer types it as one that may not
async function pageOf(target: Target): Promise<Page> {
  const page = await target.page();
  if (!page) throw new Error(`[dappress] No page behind ${target.url()}`);
  return page;
}

/** The full-screen MetaMask page, opened if it isn't already. */
export async function getHomePage(browser: Browser, extensionId: string): Promise<Page> {
  const [target] = pagesOf(browser, extensionId, HOME_PATH);
  if (target) return pageOf(target);
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}${HOME_PATH}`, { waitUntil: 'domcontentloaded' });
  return page;
}

/**
 * The page a dapp request is shown on. Waits for the popup to open, or takes
 * the side panel. A popup still on its home route is skipped. The route is
 * read from the page, which follows a change of hash at once, where the
 * target can still name the request just answered.
 */
export async function getConfirmationPage(browser: Browser, extensionId: string, timeout: number): Promise<Page> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const page = (await getRequestPages(browser, extensionId)).find((candidate) => !isHomeRoute(candidate.url()));
    if (page) return page;
    await sleep(250);
  }
  const seen = browser
    .targets()
    .filter((target) => extensionIdOf(target.url()) === extensionId)
    .map((target) => `${target.type()} ${target.url()}`)
    .join(', ');
  throw new Error(`[dappress] MetaMask showed no confirmation within ${timeout}ms. Did the dapp send a request? MetaMask pages seen: ${seen || 'none'}`);
}

/**
 * Once the request shown on a popup is answered, wait for the popup to close,
 * at most `timeout` ms. MetaMask closes it a moment after its button goes, and
 * left to close on its own, the next command could find it, still listed on
 * `request`, and act on a page that vanishes under it. A popup that goes on
 * to another request instead is left to it; so is the side panel, which stays.
 */
export async function waitForDismissal(page: Page, request: string, timeout: number): Promise<void> {
  if (!request.includes('/notification.html')) return;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (page.isClosed()) return;
    const url = page.url();
    if (url !== request && !isHomeRoute(url)) return;
    await sleep(100);
  }
}

// MetaMask asks Chrome for a 400x620 popup. Under Xvfb on a GitHub runner the
// window it gets is 1x1: nothing is laid out, the pane of a confirmation that
// must be read to the end has no height, so it can never be scrolled there and
// its Confirm button stays disabled. The popup is given its size back first.
const POPUP = { width: 400, height: 620 };

async function withUsableWindow(page: Page): Promise<Page> {
  const session = await page.target().createCDPSession();
  try {
    const { windowId, bounds } = await session.send('Browser.getWindowForTarget');
    if (bounds.windowState === 'normal' && (bounds.width ?? 0) >= 200 && (bounds.height ?? 0) >= 200) return page;
    console.log(
      `[dappress] MetaMask's popup is ${bounds.width}x${bounds.height} (${bounds.windowState}), as under Xvfb without a window manager; resizing it to ${POPUP.width}x${POPUP.height}`,
    );
    if (bounds.windowState !== 'normal') await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await session.send('Browser.setWindowBounds', { windowId, bounds: { ...POPUP } });
    // Let the page lay itself out at its new size before anything is looked for in it
    await sleep(300);
  } catch (error) {
    console.warn(`[dappress] Could not check the popup window's size: ${(error as Error).message}`);
  } finally {
    await session.detach().catch(() => {});
  }
  return page;
}
