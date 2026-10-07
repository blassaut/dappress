// Small helpers on top of Puppeteer's Page API. They give every interaction
// the same waiting and error reporting, and stay within what MetaMask's
// sandbox (LavaMoat) allows: no script injected into the page.
//
// Every wait has one budget: the page's default timeout, which Dappress sets
// to the `timeout` option when it takes a MetaMask page (metamask-pages.ts).
// A wait that runs out fails with what the page shows.
//
// A "selector" is a CSS or XPath selector, or a list of them tried together:
// the first one to show up wins.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ElementHandle, Page } from 'puppeteer-core';

export type Selector = string | string[];

const SCREENSHOTS_DIR = path.join(os.tmpdir(), 'dappress');
// How often a state read from Node is read again
const POLL = 100;
// How long an error waits for the text of the page it describes: a page that
// does not answer must not hold the error back
const TEXT_READ = 2000;

const candidates = (selector: Selector) => ([] as string[]).concat(selector);
const budget = (page: Page) => page.getDefaultTimeout();

/** A readable name for a selector, for error messages. */
export function describe(selector: Selector): string {
  return candidates(selector)
    .map((candidate) => candidate.replace(/^\[data-testid="(.+)"\]$/, '$1').replace(/^xpath\/.*="(.+)"\]$/, 'button "$1"'))
    .join(' | ');
}

/** Wait for the first candidate to be visible and return its element handle. */
export async function waitFor(page: Page, selector: Selector): Promise<ElementHandle<Element>> {
  const timeout = budget(page);
  const attempts = candidates(selector).map((candidate) => page.waitForSelector(candidate, { visible: true, timeout }));
  try {
    // Never null: that is for a wait on a hidden element
    return (await Promise.any(attempts))!;
  } catch {
    throw await failure(page, `Timed out after ${timeout}ms waiting for "${describe(selector)}"`);
  } finally {
    // Let the losing attempts fail quietly when they time out
    attempts.forEach((attempt) => attempt.catch(() => {}));
  }
}

/** Wait until no candidate is visible any more, or the page itself closed. */
export async function waitForGone(page: Page, selector: Selector): Promise<void> {
  const timeout = budget(page);
  try {
    await Promise.all(candidates(selector).map((candidate) => page.waitForSelector(candidate, { hidden: true, timeout })));
  } catch {
    if (page.isClosed()) return;
    throw await failure(page, `"${describe(selector)}" was still showing after ${timeout}ms`);
  }
}

/** Whether a candidate is visible now, without waiting for one. */
export async function isShown(page: Page, selector: Selector): Promise<boolean> {
  for (const candidate of candidates(selector)) {
    const element = await page.$(candidate).catch(() => null);
    if (element && (await element.isVisible().catch(() => false))) return true;
  }
  return false;
}

/**
 * Wait for the first of several screens to show, and say which: each is
 * named by a key and known by its selector. For a flow that goes on from
 * whichever screen MetaMask shows next.
 */
export async function firstOf<K extends string>(page: Page, screens: Record<K, Selector>): Promise<K> {
  const keys = Object.keys(screens) as K[];
  let shown: K | undefined;
  await waitUntil(page, `one of ${keys.join(', ')}`, async () => {
    for (const key of keys) {
      if (await isShown(page, screens[key])) {
        shown = key;
        return true;
      }
    }
    return false;
  });
  return shown!;
}

/**
 * Wait until `condition` holds, read from Node every POLL ms: for a state the
 * page shows in a value rather than by an element coming or going. `what`
 * names it in the error.
 */
export async function waitUntil(page: Page, what: string, condition: () => Promise<boolean>): Promise<void> {
  const timeout = budget(page);
  if (!(await until(condition, timeout))) throw await failure(page, `Timed out after ${timeout}ms waiting for ${what}`);
}

/** Read `condition` every POLL ms until it holds, at most `timeout` ms. Yields whether it did. */
export async function until(condition: () => Promise<boolean>, timeout: number): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (!(await condition())) {
    if (Date.now() > deadline) return false;
    await sleep(POLL);
  }
  return true;
}

/** What a click does when something covers the element: clear it away, as a user would. */
export type ClickOptions = { uncover?: () => Promise<void> };

/**
 * Click the element once it is ready for it: visible, still and uncovered
 * (waitForReady). An element a re-render replaced before the click is taken
 * again: the click never reached it.
 */
export async function click(page: Page, selector: Selector, { uncover }: ClickOptions = {}): Promise<void> {
  const deadline = Date.now() + budget(page);
  for (;;) {
    const element = await waitFor(page, selector);
    try {
      await waitForReady(page, element, uncover);
      return await element.click();
    } catch (error) {
      if (!/detached|not clickable/.test((error as Error).message) || Date.now() > deadline) throw error;
    }
  }
}

/**
 * Wait until the element is enabled, then click it. `whileDisabled` is what
 * the page wants done before it enables the button, run meanwhile: MetaMask
 * keeps a confirmation's button disabled until its content was read to the end.
 */
export async function clickWhenEnabled(
  page: Page,
  selector: Selector,
  { whileDisabled, uncover }: ClickOptions & { whileDisabled?: () => Promise<void> } = {},
): Promise<void> {
  const enabled = async () => {
    // Taken again each time: a handle on a replaced element reads its last state forever
    const element = await waitFor(page, selector);
    if (!(await element.evaluate((el) => (el as HTMLButtonElement).disabled))) return true;
    await whileDisabled?.();
    return false;
  };
  try {
    await waitUntil(page, `"${describe(selector)}" to be enabled`, enabled);
  } catch (error) {
    throw new Error(`${(error as Error).message} ${await describeDisabled(page, selector)}`, { cause: error });
  }
  await click(page, selector, { uncover });
}

// What may keep a button disabled: the button itself (a spinner, a class),
// a pane left to scroll, the page not being the focused one
async function describeDisabled(page: Page, selector: Selector): Promise<string> {
  try {
    const element = await waitFor(page, selector);
    const state = await page.evaluate((button) => {
      const panes = [...document.querySelectorAll('[style*="overflow"]')]
        .filter((pane) => pane.scrollHeight > pane.clientHeight)
        .map((pane) => `${pane.scrollTop}+${pane.clientHeight}/${pane.scrollHeight}`);
      return {
        button: button.outerHTML.replace(/\s+/g, ' ').slice(0, 300),
        panesToScroll: panes,
        viewport: `${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`,
        focused: document.hasFocus(),
        visibility: document.visibilityState,
      };
    }, element);
    return `Button: ${JSON.stringify({ ...state, window: await windowBounds(page) })}.`;
  } catch {
    return '';
  }
}

// The size and state of the window the page is in, as "400x620 normal"
async function windowBounds(page: Page): Promise<string> {
  const session = await page.target().createCDPSession();
  try {
    const { bounds } = await session.send('Browser.getWindowForTarget');
    return `${bounds.width}x${bounds.height} ${bounds.windowState}`;
  } catch {
    return 'unknown';
  } finally {
    await session.detach().catch(() => {});
  }
}

/** Click by dispatching the event on the element itself, for a button something may cover. */
export async function dispatchClick(page: Page, selector: Selector): Promise<void> {
  const element = await waitFor(page, selector);
  await element.evaluate((el) => (el as HTMLElement).click());
}

/**
 * Wait for the element to take a click: its box the same twice in a row,
 * POLL ms apart, and nothing over its middle, where the click lands.
 * MetaMask animates its menus and confirmations in, and lays a toast over the
 * bottom of its screens for a few seconds after some actions, a link across
 * its whole surface: a click meanwhile goes to the toast. An element without
 * a box is still being laid out, or hidden by a redraw. An element below the
 * fold is scrolled to, as a click would; one something covers is uncovered,
 * when the caller knows how.
 */
async function waitForReady(page: Page, element: ElementHandle<Element>, uncover?: () => Promise<void>): Promise<void> {
  // No box read yet: the first one is compared with the next
  let previous = '';
  await waitUntil(page, 'the element to be still and uncovered', async () => {
    const box = await element.boundingBox();
    const current = JSON.stringify(box);
    const still = current === previous && box !== null;
    previous = current;
    if (!still) return false;
    const hit = await hitTest(element, box);
    if (hit === 'outside') await element.scrollIntoView();
    if (hit === 'covered') await uncover?.();
    return hit === 'element';
  });
}

/**
 * What a click in the middle of the element's box hits: the element or
 * something inside it, something over it, or nothing, the middle being out
 * of the viewport.
 */
async function hitTest(
  element: ElementHandle<Element>,
  box: { x: number; y: number; width: number; height: number },
): Promise<'element' | 'covered' | 'outside'> {
  return element
    .evaluate(
      (el, x, y) => {
        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return 'outside';
        const hit = document.elementFromPoint(x, y);
        return hit !== null && (hit === el || el.contains(hit)) ? 'element' : 'covered';
      },
      box.x + box.width / 2,
      box.y + box.height / 2,
    )
    .catch(() => 'covered' as const);
}

/** Replace the content of a field with `text`. */
export async function fill(page: Page, selector: Selector, text: string): Promise<void> {
  const element = await waitFor(page, selector);
  await element.click({ count: 3 });
  await element.type(text);
}

/**
 * The error for something that went wrong on `page`: what the page shows, in
 * words for the log and as a screenshot to look at.
 */
export async function failure(page: Page, message: string): Promise<Error> {
  const prefix = `[dappress] ${message} on ${page.url()}`;
  const shown = await pageText(page);
  try {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const file = path.join(SCREENSHOTS_DIR, `${Date.now()}.png`);
    await page.screenshot({ path: file });
    return new Error(`${prefix}. ${shown}Screenshot: ${file}`);
  } catch {
    return new Error(`${prefix}. ${shown}`.trim());
  }
}

// The visible text of the page, shortened: enough to tell which MetaMask
// screen it is from the log alone, when the screenshot is out of reach
async function pageText(page: Page): Promise<string> {
  try {
    const read = page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
    const text = await Promise.race([read, sleep(TEXT_READ).then(() => null)]);
    return text ? `The page shows: "${text.length > 500 ? `${text.slice(0, 500)}…` : text}". ` : '';
  } catch {
    return '';
  }
}

/** The text of the first element `selector` matches, or null when there is none. */
export async function textOf(page: Page, selector: string): Promise<string | null> {
  const element = await page.$(selector);
  return element ? element.evaluate((el) => (el.textContent ?? '').trim()).catch(() => null) : null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
