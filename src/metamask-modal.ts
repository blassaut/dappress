// The modals MetaMask shows over any of its screens, and how to close them.

import type { Page } from 'puppeteer-core';
import { isVisible, isGone, dispatchClick } from './page-helpers';
import { selectors } from './metamask-selectors';

/**
 * Close a modal shown over the screen: Escape, then the cross of its header,
 * then its last button, which is "Cancel" on the "multiple requests" modal.
 * The last button is the last resort: on an offer such as Transaction
 * Shield's, it is a call to action that opens a page, which hides this one.
 */
export async function dismissModal(page: Page): Promise<void> {
  if (!(await isVisible(page, selectors.modal.content, 300))) return;
  await page.keyboard.press('Escape');
  if (await isGone(page, selectors.modal.content, 1000)) return;
  const close = await page.$(selectors.modal.close);
  if (close) {
    await close.click().catch(() => {});
    if (await isGone(page, selectors.modal.content, 1000)) return;
  }
  await dispatchClick(page, selectors.modal.lastButton);
}
