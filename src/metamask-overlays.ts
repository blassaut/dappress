// What MetaMask shows over its screens, and how to get past it as a user
// would: a modal the flow did not open, closed; the toasts, closed when they
// cover what is to be pressed. Every click of the flows goes through press().

import type { ElementHandle, Page } from 'puppeteer-core';
import { isShown, click, clickWhenEnabled, waitForGone, waitUntil, type Selector } from './page-helpers';
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
  await click(page, (await isShown(page, selectors.modal.close)) ? selectors.modal.close : selectors.modal.lastButton);
  await waitForGone(page, selectors.modal.content);
}

/** Close the toasts at the bottom of the screen, one after the other. */
export async function dismissToasts(page: Page): Promise<void> {
  await waitUntil(page, 'the toasts to close', async () => {
    if (!(await isShown(page, selectors.toast.close))) return true;
    await click(page, selectors.toast.close);
    return false;
  });
}

/**
 * What to clear away when `covering` lies over what is to be pressed: the
 * toasts, or a modal the flow did not open, as MetaMask's offers come up over
 * its home a while after it loads. Anything else is waited for to go.
 */
async function uncover(page: Page, covering: ElementHandle<Element>): Promise<void> {
  const overlay = await covering
    .evaluate((el, toastClose) => {
      // A toast is what holds a toast's close button, a few levels up from its link
      for (let node: Element | null = el, level = 0; node && level < 5; node = node.parentElement, level++) {
        if (node.querySelector(toastClose)) return 'toast';
      }
      return el.closest('.mm-modal, .mm-modal-overlay, .mm-modal-content') ? 'modal' : null;
    }, selectors.toast.close)
    .catch(() => null);
  if (overlay === 'toast') await dismissToasts(page);
  if (overlay === 'modal') await dismissModal(page);
}

/** Click as a user does: once the element is ready, past what MetaMask laid over it. */
export function press(page: Page, selector: Selector): Promise<void> {
  return click(page, selector, { uncover: (covering) => uncover(page, covering) });
}

/** Click once the button is enabled, as press() does; `whileDisabled` is done meanwhile, as in clickWhenEnabled(). */
export function pressWhenEnabled(page: Page, selector: Selector, options: { whileDisabled?: () => Promise<void> } = {}): Promise<void> {
  return clickWhenEnabled(page, selector, { ...options, uncover: (covering) => uncover(page, covering) });
}
