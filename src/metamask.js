// MetaMask's screens: what to click, and in which order.
//
// Selectors come from MetaMask's own end-to-end page objects
// (test/e2e/page-objects in the metamask-extension repository), which MetaMask
// has to keep working for its own test suite. Each entry lists the data-testid
// first, then a fallback on the button's English text. When a MetaMask release
// moves something, this is the file to fix.

const { describe, waitFor, isVisible, isGone, click, clickWhenEnabled, dispatchClick, fill, failure, sleep } = require('./page-helpers');

const testId = (id) => `[data-testid="${id}"]`;
// XPath rather than Puppeteer's ::-p-text(): the latter needs MutationObserver,
// which MetaMask's sandbox (LavaMoat) blocks in its pages.
const buttonText = (text) => `xpath/.//button[normalize-space(.)="${text}"]`;
const passwordInput = (position) => `xpath/(.//input[@type="password"])[${position}]`;

const selectors = {
  onboarding: {
    importWallet: [testId('onboarding-import-wallet'), buttonText('I have an existing wallet')],
    importWithSrp: [testId('onboarding-import-with-srp-button'), buttonText('Import using Secret Recovery Phrase')],
    srpInput: testId('srp-input-import__srp-note'),
    srpWord: (index) => testId(`import-srp__srp-word-${index}`),
    srpConfirm: [testId('import-srp-confirm'), buttonText('Continue')],
    newPassword: [testId('create-password-new-input'), passwordInput(1)],
    confirmPassword: [testId('create-password-confirm-input'), passwordInput(2)],
    passwordTerms: testId('create-password-terms'),
    passwordSubmit: [testId('create-password-submit'), buttonText('Import my wallet')],
    passkeyMaybeLater: [testId('passkey-maybe-later-button'), buttonText('Maybe later')],
    metricsCheckbox: testId('metametrics-checkbox'),
    metricsContinue: [testId('metametrics-i-agree'), buttonText('Continue')],
    downloadAppContinue: testId('download-app-continue'),
    done: [testId('onboarding-complete-done'), buttonText('Done')],
  },
  unlock: {
    password: [testId('unlock-password'), passwordInput(1)],
    submit: [testId('unlock-submit'), buttonText('Unlock')],
  },
  home: {
    header: testId('parent-selector-header-navbar'),
  },
  // "Connect this website with MetaMask"
  connect: {
    confirm: [testId('confirm-btn'), buttonText('Connect')],
    cancel: [testId('cancel-btn'), buttonText('Cancel')],
  },
  // Signatures, transactions and "Add network" share the same confirmation footer
  confirmation: {
    confirm: [testId('confirm-footer-button'), buttonText('Confirm'), buttonText('Approve')],
    cancel: [testId('confirm-footer-cancel-button'), buttonText('Cancel')],
    scrollToBottom: testId('confirm-scroll-to-bottom'),
  },
  // Switching to a network the dapp isn't allowed on yet asks to update its
  // permissions; older builds show "Allow this site to switch the network".
  // A switch to an allowed network is silent, so nothing to click then.
  switchNetwork: {
    confirm: [testId('page-container-footer-next'), testId('confirmation-submit-button'), buttonText('Confirm')],
    cancel: [testId('page-container-footer-cancel'), testId('confirmation-cancel-button'), buttonText('Cancel')],
  },
  // "We've noticed multiple requests": shown over the confirmation when a dapp
  // sends many requests in a row, and it swallows the clicks
  modal: {
    content: '.mm-modal-content',
    lastButton: 'xpath/(.//div[contains(@class, "mm-modal-content")]//button)[last()]',
  },
};

// Which button each command presses on the confirmation
const decisions = {
  connectToDapp: selectors.connect.confirm,
  rejectConnection: selectors.connect.cancel,
  approveNewNetwork: selectors.confirmation.confirm,
  rejectNewNetwork: selectors.confirmation.cancel,
  approveSwitchNetwork: selectors.switchNetwork.confirm,
  rejectSwitchNetwork: selectors.switchNetwork.cancel,
  confirmSignature: selectors.confirmation.confirm,
  rejectSignature: selectors.confirmation.cancel,
  confirmTransaction: selectors.confirmation.confirm,
  rejectTransaction: selectors.confirmation.cancel,
};

/** Which screen the extension home page is showing right now. */
async function walletState(page) {
  if (await isVisible(page, selectors.onboarding.importWallet, 3000)) return 'onboarding';
  if (await isVisible(page, selectors.unlock.password, 1000)) return 'locked';
  if (await isVisible(page, selectors.home.header, 1000)) return 'unlocked';
  return 'unknown';
}

/** Import a wallet from its seed phrase on a fresh MetaMask install. */
async function onboard(page, { seedPhrase, password }) {
  const s = selectors.onboarding;
  await click(page, s.importWallet, { timeout: 30000 });
  await click(page, s.importWithSrp);

  await fillSeedPhrase(page, seedPhrase);
  await clickWhenEnabled(page, s.srpConfirm);

  await fill(page, s.newPassword, password);
  await fill(page, s.confirmPassword, password);
  await click(page, s.passwordTerms);
  await clickWhenEnabled(page, s.passwordSubmit);

  await dismissOptionalScreens(page);
  await waitForHome(page);
}

// MetaMask's sandbox (LavaMoat) blocks a scripted paste, so the phrase is
// typed word by word: a space after a word moves the cursor to the next field.
async function fillSeedPhrase(page, seedPhrase) {
  const words = seedPhrase.trim().split(/\s+/);
  await fill(page, selectors.onboarding.srpInput, words[0]);
  await page.keyboard.press('Space');
  for (let index = 1; index < words.length; index++) {
    await fill(page, selectors.onboarding.srpWord(index), words[index]);
    if (index < words.length - 1) await page.keyboard.press('Space');
  }
}

// The screens after the password depend on the build flags: passkey setup,
// analytics opt-in, "download the app". Dismiss whichever shows up until "Done".
async function dismissOptionalScreens(page) {
  const s = selectors.onboarding;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await isVisible(page, s.done)) {
      await click(page, s.done);
      return;
    }
    if (await isVisible(page, s.passkeyMaybeLater, 500)) await click(page, s.passkeyMaybeLater);
    if (await isVisible(page, s.metricsCheckbox, 500)) {
      await optOutOfMetrics(page);
      await click(page, s.metricsContinue);
    }
    if (await isVisible(page, s.downloadAppContinue, 500)) await click(page, s.downloadAppContinue);
  }
  throw await failure(page, 'Onboarding did not reach the "Done" screen');
}

async function optOutOfMetrics(page) {
  const checkbox = await waitFor(page, selectors.onboarding.metricsCheckbox);
  const checked = await checkbox.evaluate((el) => el.getAttribute('data-checked') === 'true');
  if (checked) await checkbox.click();
}

// MetaMask records the onboarding as complete shortly after "Done". Until
// then its pages still redirect to the onboarding, so reload the home page
// until it shows the wallet.
async function waitForHome(page) {
  const homeUrl = page.url().split('#')[0];
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    // Through about:blank: dropping only the "#" part would be a same-document navigation, which goto() waits on forever
    await page.goto('about:blank');
    await page.goto(homeUrl);
    if (await isVisible(page, selectors.home.header, 3000)) return;
    await sleep(1000);
  }
  throw await failure(page, 'MetaMask did not show the wallet after onboarding');
}

async function unlock(page, { password }) {
  await fill(page, selectors.unlock.password, password);
  await click(page, selectors.unlock.submit);
  await waitFor(page, selectors.home.header);
}

/** Press the button of `decision` on the confirmation shown on `page`. */
function decide(decision, page, timeout) {
  return pressAndWaitForDismissal(page, decisions[decision], timeout);
}

/** wallet_addEthereumChain on a network MetaMask knows behaves like a switch: either prompt may show. */
function approveNetworkChange(page, timeout) {
  return pressAndWaitForDismissal(page, [...selectors.confirmation.confirm, ...selectors.switchNetwork.confirm], timeout);
}

/**
 * Press a footer button, then wait for the confirmation to go away: the
 * popup closes, the side panel goes back to the home screen. A click that
 * lands while the confirmation is still settling is lost, so the click is
 * repeated while the button stays.
 */
async function pressAndWaitForDismissal(page, button, timeout) {
  await waitFor(page, button, { timeout });
  await dismissModal(page);
  if (await isVisible(page, selectors.confirmation.scrollToBottom, 500)) {
    await click(page, selectors.confirmation.scrollToBottom);
  }
  await clickWhenEnabled(page, button);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await isGone(page, button, 3000)) return;
    await dismissModal(page);
    await dispatchClick(page, button, { timeout: 3000 }).catch(() => {});
  }
  throw await failure(page, `"${describe(button)}" is still showing after being clicked`);
}

/** Close a modal shown over the confirmation (Escape, or its last button: "Cancel"). */
async function dismissModal(page) {
  if (!(await isVisible(page, selectors.modal.content, 300))) return;
  await page.keyboard.press('Escape');
  if (await isGone(page, selectors.modal.content, 1000)) return;
  await dispatchClick(page, selectors.modal.lastButton);
}

module.exports = { decisions, walletState, onboard, unlock, decide, approveNetworkChange };
