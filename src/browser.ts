// Connects Puppeteer to the browser Cypress launched, through the debugging
// URL Cypress hands out in after:browser:launch (Cypress 13.6+).

import puppeteer, { type Browser } from 'puppeteer-core';

let debuggerUrl: string | undefined;

export function captureDebuggerUrl(on: Cypress.PluginEvents): void {
  on('after:browser:launch', (browser, options) => {
    debuggerUrl = options.webSocketDebuggerUrl;
  });
}

/**
 * Run `action` with a Puppeteer browser connected to Cypress's browser, then
 * give the focus back to the Cypress tab and disconnect. The browser stays open.
 */
export async function withBrowser<T>(action: (browser: Browser) => Promise<T>): Promise<T> {
  if (!debuggerUrl) {
    throw new Error('[dappress] No browser to connect to. Is configureDappress() called in setupNodeEvents, with Cypress 13.6 or later?');
  }
  const browser = await puppeteer.connect({ browserWSEndpoint: debuggerUrl, defaultViewport: null });
  try {
    return await action(browser);
  } catch (error) {
    // The browser side only gets the message, so keep the full stack in the terminal
    console.error((error as Error).stack || error);
    throw error;
  } finally {
    await focusCypressTab(browser).catch(() => {});
    await browser.disconnect();
  }
}

// MetaMask opens its own tabs and popups; Chrome throttles the Cypress tab
// while it is in the background. The Cypress runner lives under /__/.
async function focusCypressTab(browser: Browser): Promise<void> {
  const target = browser.targets().find((candidate) => candidate.type() === 'page' && candidate.url().includes('/__/'));
  if (target) await (await target.page())?.bringToFront();
}
