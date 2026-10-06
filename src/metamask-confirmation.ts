// The confirmation a dapp's request opens, in the popup or the side panel:
// which button a command presses, what it sets first when the test asked for
// it (the accounts of a connection, the options of a transaction), and how
// the button is pressed until the confirmation goes away.

import type { ConsoleMessage, Page } from 'puppeteer-core';
import { describe, waitFor, isVisible, isGone, click, clickWhenEnabled, dispatchClick, failure, sleep, type Selector } from './page-helpers';
import { waitForDismissal } from './metamask-pages';
import { selectors, decisions, type Decision } from './metamask-selectors';
import { dismissModal } from './metamask-modal';
import { accountNames } from './metamask-wallet';
import { adjustTransaction } from './metamask-transaction';
import type { ConnectOptions, TransactionOptions } from './types';

/** The options a command took from the test: those of the commands that take any. */
type CommandOptions = ConnectOptions & TransactionOptions;

// What a command sets on its confirmation before pressing the button, when the
// test passed it options: adjustments[command](page, options, timeout)
const adjustments: Partial<Record<Decision, (page: Page, options: CommandOptions, timeout: number) => Promise<void>>> = {
  connectToDapp: chooseAccounts,
  confirmTransaction: adjustTransaction,
};

/**
 * Connect the dapp with the accounts named in `accounts` and no other, in the
 * list the connection request opens: the boxes of the others are unticked,
 * theirs ticked, and the list saved, which goes back to the request.
 */
async function chooseAccounts(page: Page, { accounts }: ConnectOptions): Promise<void> {
  if (accounts === undefined) return;
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('[dappress] connectToDapp({ accounts }) needs the name of at least one account');
  const wanted = [...new Set(accounts)];
  await openConnectAccounts(page);
  const listed = await accountNames(page);
  const unknown = wanted.filter((name) => !listed.includes(name));
  if (unknown.length) {
    const quoted = (names: string[]) => names.map((name) => `"${name}"`).join(', ');
    throw await failure(page, `MetaMask lists no account named ${quoted(unknown)} to connect: it lists ${quoted(listed)}`);
  }
  for (const name of listed) await tickAccount(page, name, wanted.includes(name));
  await saveConnectAccounts(page, wanted);
}

// As elsewhere, a click that lands while the request settles is lost: pressed again until the list shows
async function openConnectAccounts(page: Page): Promise<void> {
  const s = selectors.connectAccounts;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await isVisible(page, s.save, 500))) await click(page, s.edit);
    if (await isVisible(page, s.save, 5000)) return;
  }
  throw await failure(page, 'MetaMask did not open the accounts of the connection');
}

// A click on an account's row ticks or unticks its box. The box is read
// before each click: a second click on a row that took the first undoes it.
async function tickAccount(page: Page, name: string, ticked: boolean): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await isTicked(page, name, ticked, 500)) return;
    await click(page, selectors.accounts.cell(name));
    if (await isTicked(page, name, ticked, 3000)) return;
  }
  throw await failure(page, `MetaMask did not ${ticked ? 'tick' : 'untick'} "${name}"`);
}

async function isTicked(page: Page, name: string, ticked: boolean, timeout: number): Promise<boolean> {
  const deadline = Date.now() + timeout;
  do {
    const checkbox = await page.$(selectors.connectAccounts.checkbox(name));
    const state = checkbox ? await checkbox.evaluate((el) => (el as HTMLInputElement).checked).catch(() => null) : null;
    if (state === ticked) return true;
    await sleep(250);
  } while (Date.now() < deadline);
  return false;
}

// Saving goes back to the request, which then shows what was chosen
async function saveConnectAccounts(page: Page, names: string[]): Promise<void> {
  const s = selectors.connectAccounts;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await isVisible(page, s.save, 500)) await clickWhenEnabled(page, s.save);
    if (!(await isGone(page, s.save, 5000))) continue;
    if (await isVisible(page, s.chosen(names), 5000)) return;
    break;
  }
  throw await failure(page, `MetaMask did not keep ${names.map((name) => `"${name}"`).join(', ')} as the accounts to connect`);
}

/** Press the button of `decision` on the confirmation shown on `page`, once it is set as `options` ask. */
export async function decide(decision: Decision, page: Page, timeout: number, options?: CommandOptions): Promise<void> {
  if (options) {
    const adjust = adjustments[decision];
    if (!adjust) throw new Error(`[dappress] ${decision} takes no options`);
    await waitForButton(page, decisions[decision], timeout);
    await adjust(page, options, timeout);
  }
  return pressAndWaitForDismissal(page, decisions[decision], timeout);
}

/**
 * Thrown when the confirmation page closed before its button was pressed: it
 * was the popup of the request before, found as it closed. The request's own
 * popup is there to be looked for.
 */
export class ConfirmationClosed extends Error {}

// The button of a confirmation, or ConfirmationClosed if the page went meanwhile
async function waitForButton(page: Page, button: Selector, timeout: number): Promise<void> {
  try {
    await waitFor(page, button, { timeout });
  } catch (error) {
    if (page.isClosed()) throw new ConfirmationClosed(`[dappress] The confirmation closed before "${describe(button)}" was pressed`);
    throw error;
  }
}

/** wallet_addEthereumChain on a network MetaMask knows behaves like a switch: either prompt may show. */
export function approveNetworkChange(page: Page, timeout: number): Promise<void> {
  return pressAndWaitForDismissal(page, [...selectors.confirmation.confirm, ...selectors.pageContainer.confirm], timeout);
}

/**
 * Press a footer button, then wait for the confirmation to go away: the
 * popup closes, the side panel goes back to the home screen. A click that
 * lands while the confirmation is still settling is lost, so the click is
 * repeated while the button stays. If it stays anyway, the error says
 * whether it is the same request or a new one the dapp sent meanwhile, and
 * what MetaMask logged.
 */
async function pressAndWaitForDismissal(page: Page, button: Selector, timeout: number): Promise<void> {
  await waitForButton(page, button, timeout);
  await dismissModal(page);
  const logged = recordErrors(page);
  const request = page.url();
  try {
    await clickWhenEnabled(page, button, { whileDisabled: () => scrollContentToEnd(page) });
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await isVisible(page, selectors.alert.acknowledge, 500)) await click(page, selectors.alert.acknowledge);
      if (await isGone(page, button, 3000)) return waitForDismissal(page, request, 3000);
      await dismissModal(page);
      await dispatchClick(page, button, { timeout: 3000 }).catch(() => {});
    }
    const what = page.url() === request ? 'MetaMask kept the same request open' : 'MetaMask shows a new request: the dapp asked again';
    const distinct = [...new Set(logged.errors)].slice(-3);
    const errors = distinct.length ? `MetaMask logged: ${distinct.join(' | ')}` : 'MetaMask logged no error';
    throw await failure(page, `"${describe(button)}" is still showing after being clicked. ${what}. ${errors}`);
  } finally {
    logged.stop();
  }
}

/** Collect the errors MetaMask's page logs to its console, until stop(). */
function recordErrors(page: Page): { errors: string[]; stop(): void } {
  const errors: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text().slice(0, 300));
  };
  const onPageError = (error: unknown) => errors.push(String((error as Error).message || error).slice(0, 300));
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return {
    errors,
    stop() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
  };
}

/**
 * MetaMask keeps the button of a confirmation disabled until its content was
 * read to the end: scrolled to the bottom, or not scrollable at all. Some
 * screens offer a button for that, most don't, so the content is scrolled
 * with the wheel, as a reader would. The popup, being small, needs it often.
 */
async function scrollContentToEnd(page: Page): Promise<void> {
  const scrollButton = await page.$(selectors.confirmation.scrollToBottom);
  if (scrollButton) {
    await scrollButton.click().catch(() => {});
    return;
  }
  // The pane itself, to its end: that fires the scroll event MetaMask listens to
  await page
    .$$eval(selectors.confirmation.scrollPane, (panes) => {
      for (const pane of panes) {
        if (pane.scrollHeight > pane.clientHeight) pane.scrollTop = pane.scrollHeight;
      }
    })
    .catch(() => {});
  // And the wheel over the content, for a pane styled otherwise
  const [width, height] = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.clientHeight]);
  await page.mouse.move(Math.round(width / 2), Math.round(height / 2));
  await page.mouse.wheel({ deltaY: 10000 });
}
