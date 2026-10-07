import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'puppeteer-core';
import { showsUnlockForm } from './metamask-wallet';

const HOME = 'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef/home.html';
const POPUP = 'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef/notification.html';

/** A MetaMask page on `url`, showing the elements of `selectors`. */
function fakePage(url: string, selectors: string[] = []) {
  return { url: () => url, $: async (selector: string) => (selectors.includes(selector) ? {} : null) } as unknown as Page;
}

test('showsUnlockForm: the unlock route, on the popup or the home page, and the one of an onboarding left unfinished', async () => {
  assert.equal(await showsUnlockForm(fakePage(`${POPUP}#/unlock`)), true);
  assert.equal(await showsUnlockForm(fakePage(`${HOME}#/unlock`)), true);
  assert.equal(await showsUnlockForm(fakePage(`${HOME}#/onboarding/unlock`)), true);
  assert.equal(await showsUnlockForm(fakePage(`${HOME}#/unlock?redirect=%2Fsettings`)), true);
});

test('showsUnlockForm: the form up on a page not routed to it yet', async () => {
  assert.equal(await showsUnlockForm(fakePage(HOME, ['[data-testid="unlock-password"]'])), true);
  assert.equal(await showsUnlockForm(fakePage(`${POPUP}#/`, ['xpath/(.//input[@type="password"])[1]'])), true);
});

test('showsUnlockForm: not on the wallet, a request, or a page that fails to be read', async () => {
  assert.equal(await showsUnlockForm(fakePage(`${HOME}#/`)), false);
  assert.equal(await showsUnlockForm(fakePage(`${POPUP}#/confirm-transaction/1/`)), false);
  assert.equal(await showsUnlockForm(fakePage(`${HOME}#/unlocked-tokens`)), false);
  const closed = {
    url: () => `${POPUP}#/connect/abc`,
    $: async () => {
      throw new Error('Target closed');
    },
  } as unknown as Page;
  assert.equal(await showsUnlockForm(closed), false);
});
