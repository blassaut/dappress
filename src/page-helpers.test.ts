import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'puppeteer-core';
import { describe, waitFor, isVisible, isGone, click, clickWhenEnabled, dispatchClick, fill, failure, textOf, waitForTextChange, sleep } from './page-helpers';

const URL = 'chrome-extension://abc/home.html';
const TEST_ID = '[data-testid="confirm-btn"]';
const BUTTON = 'xpath/.//button[normalize-space(.)="Connect"]';

/** An element of the fake page: it records what is done to it. */
function fakeElement({ disabled = false, text = '', clickErrors = [] as string[] } = {}) {
  const element = {
    disabled,
    text,
    done: [] as string[],
    // Stands for the DOM element inside the page
    evaluate: async (inPage: (el: unknown) => unknown) =>
      inPage({ disabled: element.disabled, textContent: element.text, click: () => element.done.push('dispatched click') }),
    boundingBox: async () => ({ x: 0, y: 0, width: 80, height: 30 }),
    click: async (options?: { clickCount?: number }) => {
      const error = clickErrors.shift();
      if (error) throw new Error(error);
      element.done.push(options?.clickCount ? `click x${options.clickCount}` : 'click');
    },
    type: async (text: string) => void element.done.push(`type ${text}`),
  };
  return element;
}

/** A page showing `elements`, by selector. Add or delete entries to make them show up or go. */
function fakePage(elements: Record<string, ReturnType<typeof fakeElement>> = {}, { closed = false, screenshot = true } = {}) {
  const page = {
    elements,
    screenshots: [] as string[],
    url: () => URL,
    isClosed: () => closed,
    $: async (selector: string) => elements[selector] ?? null,
    async waitForSelector(selector: string, { hidden = false, timeout = 0 }) {
      const deadline = Date.now() + timeout;
      for (;;) {
        const shown = selector in elements;
        if (hidden ? !shown : shown) return hidden ? null : elements[selector];
        if (Date.now() >= deadline) throw new Error(`Waiting for selector ${selector} failed`);
        await sleep(5);
      }
    },
    // Only the text of the page is given: what else is evaluated has no page to run in
    async evaluate(_inPage: unknown, ...args: unknown[]) {
      if (args.length) throw new Error('No page');
      return 'Connect this website with MetaMask';
    },
    async screenshot({ path }: { path: string }) {
      if (!screenshot) throw new Error('No screenshot');
      page.screenshots.push(path);
    },
  };
  return page;
}

const asPage = (page: ReturnType<typeof fakePage>) => page as unknown as Page;

test('describe: a test id by its name, a button by its text, candidates side by side', () => {
  assert.equal(describe(TEST_ID), 'confirm-btn');
  assert.equal(describe(BUTTON), 'button "Connect"');
  assert.equal(describe([TEST_ID, BUTTON]), 'confirm-btn | button "Connect"');
  assert.equal(describe('.mm-modal-content'), '.mm-modal-content');
});

test('waitFor: the first candidate to show up wins', async () => {
  const button = fakeElement();
  const page = fakePage({ [BUTTON]: button });
  assert.equal(await waitFor(asPage(page), [TEST_ID, BUTTON], { timeout: 50 }), button);
});

test('waitFor: waits for an element that shows up later', async () => {
  const button = fakeElement();
  const page = fakePage();
  setTimeout(() => (page.elements[TEST_ID] = button), 20);
  assert.equal(await waitFor(asPage(page), TEST_ID, { timeout: 500 }), button);
});

test('waitFor: the error names the selector and the page, with its text and a screenshot', async () => {
  const page = fakePage();
  await assert.rejects(waitFor(asPage(page), [TEST_ID, BUTTON], { timeout: 20 }), (error: Error) => {
    assert.match(error.message, /^\[dappress\] Timed out waiting for "confirm-btn \| button "Connect"" on chrome-extension:\/\/abc\/home\.html\./);
    assert.match(error.message, /The page shows: "Connect this website with MetaMask"\./);
    assert.ok(error.message.endsWith(`Screenshot: ${page.screenshots[0]}`));
    return true;
  });
});

test('failure: without a screenshot, the message ends on what the page shows', async () => {
  const error = await failure(asPage(fakePage({}, { screenshot: false })), 'MetaMask did not lock');
  assert.equal(error.message, `[dappress] MetaMask did not lock on ${URL}. The page shows: "Connect this website with MetaMask".`);
});

test('isVisible: true for an element shown within the timeout, false otherwise', async () => {
  const page = fakePage({ [TEST_ID]: fakeElement() });
  assert.equal(await isVisible(asPage(page), [TEST_ID, BUTTON], 20), true);
  assert.equal(await isVisible(asPage(page), BUTTON, 20), false);
});

test('isGone: true once every candidate has left, false while one stays', async () => {
  const page = fakePage({ [TEST_ID]: fakeElement() });
  assert.equal(await isGone(asPage(page), [TEST_ID, BUTTON], 20), false);
  setTimeout(() => delete page.elements[TEST_ID], 20);
  assert.equal(await isGone(asPage(page), [TEST_ID, BUTTON], 500), true);
});

test('isGone: a page that closed counts as gone', async () => {
  const page = fakePage({ [TEST_ID]: fakeElement() }, { closed: true });
  assert.equal(await isGone(asPage(page), TEST_ID, 20), true);
});

test('click: clicks the element', async () => {
  const button = fakeElement();
  await click(asPage(fakePage({ [TEST_ID]: button })), TEST_ID);
  assert.deepEqual(button.done, ['click']);
});

test('click: once more when a re-render detached the element, and no more than that', async () => {
  const button = fakeElement({ clickErrors: ['Node is detached from document'] });
  await click(asPage(fakePage({ [TEST_ID]: button })), TEST_ID);
  assert.deepEqual(button.done, ['click']);

  const gone = fakeElement({ clickErrors: ['Node is detached from document', 'Node is detached from document'] });
  await assert.rejects(click(asPage(fakePage({ [TEST_ID]: gone })), TEST_ID), /detached/);
});

test('click: another error is not retried', async () => {
  const button = fakeElement({ clickErrors: ['Node is not clickable'] });
  await assert.rejects(click(asPage(fakePage({ [TEST_ID]: button })), TEST_ID), /not clickable/);
  assert.deepEqual(button.done, []);
});

test('clickWhenEnabled: waits for the button to be enabled, doing what the page wants meanwhile', async () => {
  const button = fakeElement({ disabled: true });
  let nudges = 0;
  const whileDisabled = async () => {
    nudges++;
    button.disabled = false;
  };
  await clickWhenEnabled(asPage(fakePage({ [TEST_ID]: button })), TEST_ID, { timeout: 2000, whileDisabled });
  assert.equal(nudges, 1);
  assert.deepEqual(button.done, ['click']);
});

test('clickWhenEnabled: a button that stays disabled is not clicked', async () => {
  const button = fakeElement({ disabled: true });
  await assert.rejects(clickWhenEnabled(asPage(fakePage({ [TEST_ID]: button })), TEST_ID, { timeout: 50 }), /"confirm-btn" stayed disabled for 50ms/);
  assert.deepEqual(button.done, []);
});

test('dispatchClick: clicks from inside the page', async () => {
  const button = fakeElement();
  await dispatchClick(asPage(fakePage({ [TEST_ID]: button })), TEST_ID);
  assert.deepEqual(button.done, ['dispatched click']);
});

test('fill: selects what the field holds, then types over it', async () => {
  const field = fakeElement();
  await fill(asPage(fakePage({ [TEST_ID]: field })), TEST_ID, '2.5');
  assert.deepEqual(field.done, ['click x3', 'type 2.5']);
});

test('textOf: the text of the element, trimmed, or null without one', async () => {
  const page = fakePage({ [TEST_ID]: fakeElement({ text: ' 0.0015 ETH ' }) });
  assert.equal(await textOf(asPage(page), TEST_ID), '0.0015 ETH');
  assert.equal(await textOf(asPage(page), '.absent'), null);
});

test('waitForTextChange: returns once the text differs from what was shown', async () => {
  const row = fakeElement({ text: '0.0015 ETH' });
  const page = fakePage({ [TEST_ID]: row });
  setTimeout(() => (row.text = '0.0030 ETH'), 300);
  const started = Date.now();
  await waitForTextChange(asPage(page), TEST_ID, '0.0015 ETH', 5000);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 250 && elapsed < 2000, `returned when the text changed, after ${elapsed}ms`);
});

test('waitForTextChange: gives up at the deadline on a text that stays', async () => {
  const page = fakePage({ [TEST_ID]: fakeElement({ text: '0.0015 ETH' }) });
  const started = Date.now();
  await waitForTextChange(asPage(page), TEST_ID, '0.0015 ETH', 300);
  assert.ok(Date.now() - started >= 300);
});

test('waitForTextChange: a deadline of 0 is no wait at all', async () => {
  const page = fakePage({ [TEST_ID]: fakeElement({ text: '0.0015 ETH' }) });
  const started = Date.now();
  await waitForTextChange(asPage(page), TEST_ID, '0.0015 ETH', 0);
  assert.ok(Date.now() - started < 100);
});
