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
  await clickFresh(page, selector, options);
}

/**
 * Wait until the element is both visible and enabled, then click it. The
 * element is taken again at each turn: MetaMask re-renders its screens, and
 * a handle on a replaced element reads its last state forever.
 */
async function clickWhenEnabled(page, selector, { timeout = DEFAULT_TIMEOUT, whileDisabled } = {}) {
  const deadline = Date.now() + timeout;
  let nudged = 0;
  for (;;) {
    const element = await waitFor(page, selector, { timeout });
    if (!(await element.evaluate((el) => el.disabled))) break;
    if (Date.now() > deadline) {
      throw await failure(page, `"${describe(selector)}" stayed disabled for ${timeout}ms. ${await describeDisabled(page, element)}`);
    }
    // Something the page wants done before it enables the button, every half second
    if (whileDisabled && Date.now() - nudged > 500) {
      await whileDisabled();
      nudged = Date.now();
    }
    await sleep(100);
  }
  await clickFresh(page, selector, { timeout });
}

// What may keep a button disabled: the button itself (a spinner, a class),
// a pane left to scroll, the page not being the focused one
async function describeDisabled(page, element) {
  try {
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
    state.window = await windowBounds(page);
    return `Button: ${JSON.stringify(state)}.`;
  } catch {
    return '';
  }
}

// The size and state of the window the page is in, as "400x620 normal"
async function windowBounds(page) {
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

// Find the element and click it; once more if a re-render replaced it between the two
async function clickFresh(page, selector, options) {
  for (let attempt = 0; ; attempt++) {
    const element = await waitFor(page, selector, options);
    await waitForStill(element);
    try {
      return await element.click();
    } catch (error) {
      if (attempt > 0 || !/detached/.test(error.message)) throw error;
    }
  }
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

/**
 * The error for something that went wrong on `page`: what the page shows, in
 * words for the log and as a screenshot to look at.
 */
async function failure(page, message) {
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
async function pageText(page) {
  try {
    const text = await Promise.race([
      page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim()),
      sleep(2000).then(() => null),
    ]);
    return text ? `The page shows: "${text.length > 500 ? `${text.slice(0, 500)}…` : text}". ` : '';
  } catch {
    return '';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { describe, waitFor, isVisible, isGone, click, clickWhenEnabled, dispatchClick, fill, failure, sleep };
