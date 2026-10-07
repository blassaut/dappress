import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'puppeteer-core';
import { describe, waitFor, waitForGone, isShown, firstOf, waitUntil, click, clickWhenEnabled, fill, failure, textOf, sleep } from './page-helpers';

const URL = 'chrome-extension://abc/home.html';
const TEST_ID = '[data-testid="confirm-btn"]';
const BUTTON = 'xpath/.//button[normalize-space(.)="Connect"]';

/** An element of the fake page: it records what is done to it. */
function fakeElement({ disabled = false, text = '', clickErrors = [] as string[], boxes = [] as (object | null)[], covered = false, tagName = 'DIV' } = {}) {
  // Stands for the DOM element inside the page
  const dom = {
    tagName,
    get disabled() {
      return element.disabled;
    },
    get textContent() {
      return element.text;
    },
    hasAttribute: () => false,
  };
  const element = {
    dom,
    disabled,
    text,
    // Something over the middle of its box, which a click would hit instead
    covered,
    done: [] as string[],
    // The hit test is the evaluation given the point to test: it has no page to run in
    evaluate: async (inPage: (el: unknown) => unknown, ...point: unknown[]) => (point.length === 2 ? (element.covered ? 'covered' : 'element') : inPage(dom)),
    // What lies over the element, for the caller to clear away
    evaluateHandle: async () => ({ overlay: 'toast', evaluate: async () => 'div.toast' }),
    // The boxes to report in turn, then a steady one
    boundingBox: async () => (boxes.length ? boxes.shift() : { x: 0, y: 0, width: 80, height: 30 }),
    click: async (options?: { count?: number }) => {
      const error = clickErrors.shift();
      if (error) throw new Error(error);
      element.done.push(options?.count ? `click x${options.count}` : 'click');
    },
    focus: async () => {
      (globalThis as unknown as { document: { activeElement: unknown } }).document = { activeElement: dom };
      element.done.push('focus');
    },
    type: async (text: string) => void element.done.push(`type ${text}`),
    isVisible: async () => true,
  };
  return element;
}

/** A page showing `elements`, by selector. Add or delete entries to make them show up or go. */
function fakePage(elements: Record<string, ReturnType<typeof fakeElement>> = {}, { closed = false, screenshot = true, timeout = 500 } = {}) {
  const page = {
    elements,
    // The budget of every wait on the page
    getDefaultTimeout: () => timeout,
    keys: [] as string[],
    keyboard: { press: async (key: string) => void page.keys.push(key) },
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
// A page that gives every wait `timeout` ms
const pageWithin = (timeout: number, elements: Record<string, ReturnType<typeof fakeElement>> = {}) => fakePage(elements, { timeout });

test('describe: a test id by its name, a button by its text, candidates side by side', () => {
  assert.equal(describe(TEST_ID), 'confirm-btn');
  assert.equal(describe(BUTTON), 'button "Connect"');
  assert.equal(describe([TEST_ID, BUTTON]), 'confirm-btn | button "Connect"');
  assert.equal(describe('.mm-modal-content'), '.mm-modal-content');
});

test('waitFor: the first candidate to show up wins', async () => {
  const button = fakeElement();
  const page = fakePage({ [BUTTON]: button });
  assert.equal(await waitFor(asPage(page), [TEST_ID, BUTTON]), button);
});

test('waitFor: waits for an element that shows up later', async () => {
  const button = fakeElement();
  const page = fakePage();
  setTimeout(() => (page.elements[TEST_ID] = button), 20);
  assert.equal(await waitFor(asPage(page), TEST_ID), button);
});

test("waitFor: the error names the selector, the page's budget and the page, with its text and a screenshot", async () => {
  const page = pageWithin(20);
  await assert.rejects(waitFor(asPage(page), [TEST_ID, BUTTON]), (error: Error) => {
    assert.match(error.message, /^\[dappress\] Timed out after 20ms waiting for "confirm-btn \| button "Connect"" on chrome-extension:\/\/abc\/home\.html\./);
    assert.match(error.message, /The page shows: "Connect this website with MetaMask"\./);
    assert.ok(error.message.endsWith(`Screenshot: ${page.screenshots[0]}`));
    return true;
  });
});

test('failure: without a screenshot, the message ends on what the page shows', async () => {
  const error = await failure(asPage(fakePage({}, { screenshot: false })), 'MetaMask did not lock');
  assert.equal(error.message, `[dappress] MetaMask did not lock on ${URL}. The page shows: "Connect this website with MetaMask".`);
});

test('waitForGone: returns once every candidate has left, and fails on one that stays', async () => {
  const page = fakePage({ [TEST_ID]: fakeElement() });
  setTimeout(() => delete page.elements[TEST_ID], 20);
  await waitForGone(asPage(page), [TEST_ID, BUTTON]);
  await assert.rejects(waitForGone(asPage(pageWithin(20, { [TEST_ID]: fakeElement() })), TEST_ID), /"confirm-btn" was still showing after 20ms/);
});

test('waitForGone: a page that closed counts as gone', async () => {
  await waitForGone(asPage(fakePage({ [TEST_ID]: fakeElement() }, { closed: true, timeout: 20 })), TEST_ID);
});

test('isShown: whether a candidate is visible now, without waiting', async () => {
  const page = fakePage({ [TEST_ID]: fakeElement() });
  assert.equal(await isShown(asPage(page), [BUTTON, TEST_ID]), true);
  assert.equal(await isShown(asPage(page), BUTTON), false);
});

test('firstOf: the screen that shows first, by its name', async () => {
  const page = fakePage();
  setTimeout(() => (page.elements[BUTTON] = fakeElement()), 20);
  assert.equal(await firstOf(asPage(page), { locked: TEST_ID, unlocked: BUTTON }), 'unlocked');
  await assert.rejects(firstOf(asPage(pageWithin(20)), { locked: TEST_ID }), /Timed out after 20ms waiting for one of locked/);
});

test('waitUntil: returns once the condition holds, and fails at the budget with what was waited for', async () => {
  let ready = false;
  setTimeout(() => (ready = true), 150);
  await waitUntil(asPage(fakePage()), 'the fee to change', async () => ready);
  await assert.rejects(
    waitUntil(asPage(pageWithin(20)), 'the fee to change', async () => false),
    /Timed out after 20ms waiting for the fee to change/,
  );
});

test('click: clicks the element', async () => {
  const button = fakeElement();
  await click(asPage(fakePage({ [TEST_ID]: button })), TEST_ID);
  assert.deepEqual(button.done, ['click']);
});

test('click: takes the element again when a re-render replaced it, within the budget', async () => {
  const button = fakeElement({ clickErrors: ['Node is detached from document'] });
  await click(asPage(fakePage({ [TEST_ID]: button })), TEST_ID);
  assert.deepEqual(button.done, ['click']);

  const gone = fakeElement({ clickErrors: Array(100).fill('Node is detached from document') });
  await assert.rejects(click(asPage(pageWithin(300, { [TEST_ID]: gone })), TEST_ID), /detached/);
});

test('click: waits for the element to have a box, and to keep it still', async () => {
  const moving = { x: 0, y: 10, width: 80, height: 30 };
  const button = fakeElement({ boxes: [null, null, moving, moving] });
  const started = Date.now();
  await click(asPage(fakePage({ [TEST_ID]: button }, { timeout: 2000 })), TEST_ID);
  assert.deepEqual(button.done, ['click']);
  assert.ok(Date.now() - started >= 300, 'three looks at the box before the click');
});

test('click: waits for what covers the element to go', async () => {
  const button = fakeElement({ covered: true });
  setTimeout(() => (button.covered = false), 300);
  const started = Date.now();
  await click(asPage(fakePage({ [TEST_ID]: button }, { timeout: 2000 })), TEST_ID);
  assert.deepEqual(button.done, ['click']);
  assert.ok(Date.now() - started >= 300, 'clicked once uncovered');
  await assert.rejects(click(asPage(pageWithin(300, { [TEST_ID]: fakeElement({ covered: true }) })), TEST_ID), /still and uncovered/);
});

test('click: a button is pressed from the keyboard, focused and given Enter', async () => {
  const button = fakeElement({ tagName: 'BUTTON' });
  const page = fakePage({ [TEST_ID]: button });
  await click(asPage(page), TEST_ID);
  assert.deepEqual(button.done, ['focus']);
  assert.deepEqual(page.keys, ['Enter']);
});

test('click: hands what covers the element to uncover, and clicks once it is gone', async () => {
  const button = fakeElement({ covered: true });
  const handed: unknown[] = [];
  const uncover = async (covering: unknown) => {
    handed.push(covering);
    button.covered = false;
  };
  await click(asPage(fakePage({ [TEST_ID]: button })), TEST_ID, { uncover: uncover as never });
  assert.deepEqual(
    handed.map((covering) => (covering as { overlay: string }).overlay),
    ['toast'],
  );
  assert.deepEqual(button.done, ['click']);
});

test('click: another error is not retried', async () => {
  const button = fakeElement({ clickErrors: ['Execution context was destroyed'] });
  await assert.rejects(click(asPage(fakePage({ [TEST_ID]: button })), TEST_ID), /context was destroyed/);
  assert.deepEqual(button.done, []);
});

test('clickWhenEnabled: waits for the button to be enabled, doing what the page wants meanwhile', async () => {
  const button = fakeElement({ disabled: true });
  let nudges = 0;
  const whileDisabled = async () => {
    nudges++;
    button.disabled = false;
  };
  await clickWhenEnabled(asPage(fakePage({ [TEST_ID]: button })), TEST_ID, { whileDisabled });
  assert.equal(nudges, 1);
  assert.deepEqual(button.done, ['click']);
});

test('clickWhenEnabled: a button that stays disabled is not clicked', async () => {
  const button = fakeElement({ disabled: true });
  await assert.rejects(
    clickWhenEnabled(asPage(pageWithin(50, { [TEST_ID]: button })), TEST_ID),
    /Timed out after 50ms waiting for "confirm-btn" to be enabled/,
  );
  assert.deepEqual(button.done, []);
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
