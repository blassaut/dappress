// The confirmation a dapp's request opens, in the popup or the side panel:
// which button a command presses, what it sets first when the test asked for
// it (the accounts of a connection, the options of a transaction), and how
// the button is pressed until the confirmation goes away.

import type { ConsoleMessage, Page } from 'puppeteer-core';
import { describe, waitFor, waitForGone, waitUntil, isShown, failure, type Selector } from './page-helpers';
import { waitForDismissal } from './metamask-pages';
import { selectors, decisions, type Decision } from './metamask-selectors';
import { dismissModal, press, pressWhenEnabled } from './metamask-overlays';
import { accountNames } from './metamask-wallet';
import { adjustTransaction } from './metamask-transaction';
import type { ConnectOptions, TransactionOptions } from './types';

/** The options a command took from the test: those of the commands that take any. */
type CommandOptions = ConnectOptions & TransactionOptions;

// What a command sets on its confirmation before pressing the button, when the
// test passed it options: adjustments[command](page, options)
const adjustments: Partial<Record<Decision, (page: Page, options: CommandOptions) => Promise<void>>> = {
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

async function openConnectAccounts(page: Page): Promise<void> {
  await press(page, selectors.connectAccounts.edit);
  await waitFor(page, selectors.connectAccounts.save);
}

// A click on an account's row ticks or unticks its box: read first, so that
// a row already as wanted is left as it is
async function tickAccount(page: Page, name: string, ticked: boolean): Promise<void> {
  if ((await isTicked(page, name)) === ticked) return;
  await press(page, selectors.accounts.cell(name));
  await waitUntil(page, `"${name}" to be ${ticked ? 'ticked' : 'unticked'}`, async () => (await isTicked(page, name)) === ticked);
}

async function isTicked(page: Page, name: string): Promise<boolean | null> {
  const checkbox = await page.$(selectors.connectAccounts.checkbox(name));
  return checkbox ? checkbox.evaluate((el) => (el as HTMLInputElement).checked).catch(() => null) : null;
}

// Saving goes back to the request, which then shows what was chosen
async function saveConnectAccounts(page: Page, names: string[]): Promise<void> {
  const s = selectors.connectAccounts;
  await pressWhenEnabled(page, s.save);
  await waitForGone(page, s.save);
  await waitFor(page, s.chosen(names)).catch(async () => {
    throw await failure(page, `MetaMask did not keep ${names.map((name) => `"${name}"`).join(', ')} as the accounts to connect`);
  });
}

/** Press the button of `decision` on the confirmation shown on `page`, once it is set as `options` ask. */
export async function decide(decision: Decision, page: Page, options?: CommandOptions): Promise<void> {
  if (options) {
    const adjust = adjustments[decision];
    if (!adjust) throw new Error(`[dappress] ${decision} takes no options`);
    await waitForButton(page, decisions[decision]);
    await adjust(page, options);
  }
  return pressAndWaitForDismissal(page, decisions[decision]);
}

/**
 * Thrown when the confirmation page closed before its button was pressed: it
 * was the popup of the request before, found as it closed. The request's own
 * popup is there to be looked for.
 */
export class ConfirmationClosed extends Error {}

// The button of a confirmation, or ConfirmationClosed if the page went meanwhile
async function waitForButton(page: Page, button: Selector): Promise<void> {
  try {
    await waitFor(page, button);
  } catch (error) {
    if (page.isClosed()) throw new ConfirmationClosed(`[dappress] The confirmation closed before "${describe(button)}" was pressed`);
    throw error;
  }
}

/** wallet_addEthereumChain on a network MetaMask knows behaves like a switch: either prompt may show. */
export function approveNetworkChange(page: Page): Promise<void> {
  return pressAndWaitForDismissal(page, [...selectors.confirmation.confirm, ...selectors.pageContainer.confirm]);
}

/**
 * Press a footer button, then wait for the confirmation to go away: the
 * popup closes, the side panel goes back to the home screen. MetaMask may
 * raise a warning on the way ("Switching network will cancel N pending
 * transactions"), which is acknowledged. If the button stays, the error says
 * whether it is the same request or a new one the dapp sent meanwhile, and
 * what MetaMask logged.
 */
async function pressAndWaitForDismissal(page: Page, button: Selector): Promise<void> {
  await waitForButton(page, button);
  await dismissModal(page);
  const logged = recordErrors(page);
  const request = page.url();
  try {
    await pressWhenEnabled(page, button, { whileDisabled: () => scrollContentToEnd(page) });
    const gone = async () => {
      if (page.isClosed()) return true;
      if (await isShown(page, selectors.alert.acknowledge)) await press(page, selectors.alert.acknowledge);
      return !(await isShown(page, button));
    };
    await waitUntil(page, `"${describe(button)}" to go once pressed`, gone).catch(async (error: Error) => {
      const what = page.url() === request ? 'MetaMask kept the same request open' : 'MetaMask shows a new request: the dapp asked again';
      const distinct = [...new Set(logged.errors)].slice(-3);
      const errors = distinct.length ? `MetaMask logged: ${distinct.join(' | ')}` : 'MetaMask logged no error';
      throw new Error(`${error.message.split(' on ')[0]}. ${what}. ${errors}`);
    });
    await waitForDismissal(page, request);
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
// A nudge, run while the button stays disabled: the wait around it checks
// whether it worked, so a part of it that finds nothing to scroll is no error
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
