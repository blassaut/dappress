// What MetaMask shows over its screens, and how to get past it as a user
// would: the modals, closed, and the toasts, closed when they cover what is
// to be pressed. Every click of the flows goes through press().

import type { Page } from 'puppeteer-core';
import { isShown, click, clickWhenEnabled, describe, dispatchClick, failure, firstOf, waitForGone, type Selector } from './page-helpers';
import { selectors } from './metamask-selectors';

/**
 * Close the modal shown over the screen, if any: by the cross of its header
 * when it has one, as on the Transaction Shield offer; otherwise by its last
 * button, "Cancel" on the "multiple requests" modal. The last button is not
 * pressed on a modal with a cross: on an offer, it is a call to action that
 * opens a page.
 */
export async function dismissModal(page: Page): Promise<void> {
  if (!(await isShown(page, selectors.modal.content))) return;
  if (await isShown(page, selectors.modal.close)) await click(page, selectors.modal.close);
  else await dispatchClick(page, selectors.modal.lastButton);
  await waitForGone(page, selectors.modal.content);
}

/**
 * Press `button` until `opened` shows. MetaMask shows its offers, such as
 * Transaction Shield's, over the home screen a while after it loads, at any
 * moment: one that comes up before the click takes it. The modal is then
 * closed and the button pressed again; no other click is repeated.
 */
export async function openPastModals(page: Page, button: Selector, opened: Selector): Promise<void> {
  const deadline = Date.now() + page.getDefaultTimeout();
  await dismissModal(page);
  for (;;) {
    await press(page, button);
    if ((await firstOf(page, { opened, modal: selectors.modal.content })) === 'opened') return;
    if (Date.now() > deadline) throw await failure(page, `MetaMask kept showing modals over "${describe(button)}"`);
    await dismissModal(page);
  }
}

/** Close the toasts at the bottom of the screen. */
export async function dismissToasts(page: Page): Promise<void> {
  for (const close of await page.$$(selectors.toast.close)) {
    if (await close.isVisible().catch(() => false)) await close.click();
  }
  await waitForGone(page, selectors.toast.close);
}

/** Click as a user does: once the element is ready, after closing the toasts that cover it. */
export function press(page: Page, selector: Selector): Promise<void> {
  return click(page, selector, { uncover: () => dismissToasts(page) });
}

/** Click once the button is enabled, as press() does; `whileDisabled` is done meanwhile, as in clickWhenEnabled(). */
export function pressWhenEnabled(page: Page, selector: Selector, options: { whileDisabled?: () => Promise<void> } = {}): Promise<void> {
  return clickWhenEnabled(page, selector, { ...options, uncover: () => dismissToasts(page) });
}
