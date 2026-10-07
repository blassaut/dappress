import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Browser, Page } from 'puppeteer-core';
import { getConfirmationPage, waitForDismissal } from './metamask-pages';
import { sleep } from './page-helpers';

const EXTENSION = 'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef';
const POPUP = `${EXTENSION}/notification.html`;
const SWITCH = `${POPUP}#/confirmation/switch-chain`;
const TRANSACTION = `${POPUP}#/confirm-transaction/1/`;

/**
 * A MetaMask page as the browser lists it: the target names the page by the
 * url it had last, the page itself by its current one. Already 400x620, so it
 * is not resized.
 */
function fakePage(targetUrl: string, { url = targetUrl, closed = false, timeout = 2000 } = {}) {
  const page = {
    closed,
    // The budget of the waits on the page, which Dappress sets when it takes the page
    timeout,
    setDefaultTimeout: (budget: number) => void (page.timeout = budget),
    getDefaultTimeout: () => page.timeout,
    url: () => url,
    isClosed: () => page.closed,
    target: () => target,
  };
  const target = {
    type: () => 'page',
    url: () => targetUrl,
    page: async () => page,
    createCDPSession: async () => ({
      send: async () => ({ windowId: 1, bounds: { windowState: 'normal', width: 400, height: 620 } }),
      detach: async () => {},
    }),
  };
  return page;
}

const fakeBrowser = (pages: ReturnType<typeof fakePage>[]) => ({ targets: () => pages.map((page) => page.target()) }) as unknown as Browser;
const extensionId = EXTENSION.replace('chrome-extension://', '');

test('getConfirmationPage: a popup on a request', async () => {
  const popup = fakePage(TRANSACTION);
  assert.equal(await getConfirmationPage(fakeBrowser([popup]), extensionId, 500), popup as unknown as Page);
});

test('getConfirmationPage: skips a popup back on its home route, though its target still names the request', async () => {
  const closing = fakePage(SWITCH, { url: `${POPUP}#/` });
  const opened = fakePage(TRANSACTION);
  assert.equal(await getConfirmationPage(fakeBrowser([closing, opened]), extensionId, 500), opened as unknown as Page);
});

test('getConfirmationPage: skips a side panel on the home screen, for the one showing the request', async () => {
  const home = fakePage(`${EXTENSION}/sidepanel.html#/`);
  const request = fakePage(`${EXTENSION}/sidepanel.html#/connect/13lA3wvDo0lOLha00M52k`);
  assert.equal(await getConfirmationPage(fakeBrowser([home, request]), extensionId, 500), request as unknown as Page);
});

test('getConfirmationPage: skips a popup that closed', async () => {
  const closed = fakePage(SWITCH, { closed: true });
  const opened = fakePage(TRANSACTION);
  assert.equal(await getConfirmationPage(fakeBrowser([closed, opened]), extensionId, 500), opened as unknown as Page);
});

test('getConfirmationPage: nothing but a closing popup is no confirmation', async () => {
  const closing = fakePage(SWITCH, { url: `${POPUP}#/` });
  await assert.rejects(getConfirmationPage(fakeBrowser([closing]), extensionId, 300), /showed no confirmation within 300ms/);
});

test('waitForDismissal: returns once the popup closes', async () => {
  const popup = fakePage(SWITCH, { url: `${POPUP}#/` });
  setTimeout(() => (popup.closed = true), 150);
  const started = Date.now();
  await waitForDismissal(popup as unknown as Page, SWITCH);
  assert.ok(Date.now() - started < 1000, 'returned when the popup closed, not at the deadline');
  assert.ok(popup.closed);
});

test('waitForDismissal: a popup that goes on to another request is left to it', async () => {
  const popup = fakePage(SWITCH, { url: TRANSACTION });
  const started = Date.now();
  await waitForDismissal(popup as unknown as Page, SWITCH);
  assert.ok(Date.now() - started < 500);
});

test("waitForDismissal: gives up at the page's budget on a popup that stays", async () => {
  const popup = fakePage(SWITCH, { timeout: 200 });
  const started = Date.now();
  await waitForDismissal(popup as unknown as Page, SWITCH);
  assert.ok(Date.now() - started >= 200);
});

test('waitForDismissal: the side panel stays, nothing to wait for', async () => {
  const panel = fakePage(`${EXTENSION}/sidepanel.html#/confirmation/switch-chain`);
  const started = Date.now();
  await waitForDismissal(panel as unknown as Page, panel.url());
  await sleep(0);
  assert.ok(Date.now() - started < 100);
});
