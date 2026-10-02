// Small helpers on top of Puppeteer's Page API. They give every interaction
// the same waiting and error reporting, and stay within what MetaMask's
// sandbox (LavaMoat) allows: no script injected into the page.
//
// A "selector" is a CSS or XPath selector, or a list of them tried together:
// the first one to show up wins.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_TIMEOUT = 15000;
const SCREENSHOTS_DIR = path.join(os.tmpdir(), 'dappress');

const candidates = (selector) => [].concat(selector);

/** A readable name for a selector, for error messages. */
function describe(selector) {
  return candidates(selector)
    .map((candidate) => candidate.replace(/^\[data-testid="(.+)"\]$/, '$1').replace(/^xpath\/.*="(.+)"\]$/, 'button "$1"'))
    .join(' | ');
}

/** Wait for the first candidate to be visible and return its element handle. */
async function waitFor(page, selector, { timeout = DEFAULT_TIMEOUT } = {}) {
  const attempts = candidates(selector).map((candidate) => page.waitForSelector(candidate, { visible: true, timeout }));
  try {
    return await Promise.any(attempts);
  } catch {
    throw await failure(page, `Timed out waiting for "${describe(selector)}"`);
  } finally {
    // Let the losing attempts fail quietly when they time out
    attempts.forEach((attempt) => attempt.catch(() => {}));
  }
}

/** Returns true when `selector` is visible within `timeout` ms, false otherwise. */
async function isVisible(page, selector, timeout = 1500) {
  try {
    await waitFor(page, selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

/** Returns true once every candidate has left the page, or if the page itself closes. */
async function isGone(page, selector, timeout = 1500) {
  try {
    await Promise.all(candidates(selector).map((candidate) => page.waitForSelector(candidate, { hidden: true, timeout })));
    return true;
  } catch {
    return page.isClosed();
  }
}

async function click(page, selector, options) {
  const element = await waitFor(page, selector, options);
  await waitForStill(element);
  await element.click();
}

/** Wait until the element is both visible and enabled, then click it. */
async function clickWhenEnabled(page, selector, { timeout = DEFAULT_TIMEOUT } = {}) {
  const element = await waitFor(page, selector, { timeout });
  const deadline = Date.now() + timeout;
  while (await element.evaluate((el) => el.disabled)) {
    if (Date.now() > deadline) throw await failure(page, `"${describe(selector)}" stayed disabled for ${timeout}ms`);
    await sleep(100);
  }
  await waitForStill(element);
  await element.click();
}

/** Click by dispatching the event on the element itself, for buttons something may cover. */
async function dispatchClick(page, selector, options) {
  const element = await waitFor(page, selector, options);
  await element.evaluate((el) => el.click());
}

/** MetaMask animates its menus and confirmations in; a click during the animation lands elsewhere. */
async function waitForStill(element, timeout = 2000) {
  const deadline = Date.now() + timeout;
  let previous = JSON.stringify(await element.boundingBox());
  while (Date.now() < deadline) {
    await sleep(100);
    const current = JSON.stringify(await element.boundingBox());
    if (current === previous) return;
    previous = current;
  }
}

/** Replace the content of a field with `text`. */
async function fill(page, selector, text, options) {
  const element = await waitFor(page, selector, options);
  await element.click({ clickCount: 3 });
  await element.type(text);
}

/** The error for something that went wrong on `page`, with a screenshot to look at. */
async function failure(page, message) {
  const prefix = `[dappress] ${message} on ${page.url()}`;
  try {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const file = path.join(SCREENSHOTS_DIR, `${Date.now()}.png`);
    await page.screenshot({ path: file });
    return new Error(`${prefix}. Screenshot: ${file}`);
  } catch {
    return new Error(prefix);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { describe, waitFor, isVisible, isGone, click, clickWhenEnabled, dispatchClick, fill, failure, sleep };
