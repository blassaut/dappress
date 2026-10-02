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
    // "Manage default settings", offered next to "Done"
    manageDefaultSettings: testId('manage-default-settings'),
    // The first category, "General": its testid carries the translated label
    generalSettings: 'xpath/(.//*[starts-with(@data-testid, "category-item-")])[1]',
    backupAndSyncToggle: testId('backup-and-sync-toggle-button'),
    categoryBack: testId('category-back-button'),
    settingsBack: testId('privacy-settings-back-button'),
  },
  unlock: {
    password: [testId('unlock-password'), passwordInput(1)],
    submit: [testId('unlock-submit'), buttonText('Unlock')],
  },
  home: {
    header: testId('parent-selector-header-navbar'),
    accountMenu: testId('account-menu-icon'),
  },
  // The account list, opened from the home header
  accounts: {
    name: '[data-testid^="multichain-account-cell-name-"]',
    cell: (name) => `xpath/.//*[contains(@class, "multichain-account-cell")][.//*[@data-testid="multichain-account-cell-name-${name}"]]`,
    add: 'xpath/(.//*[@data-testid="add-multichain-account-button"])[1]',
    addWallet: testId('account-list-add-wallet-button'),
    importAccount: testId('choose-wallet-type-import-account'),
    privateKey: '#private-key-box',
    importConfirm: [testId('import-account-confirm-button'), buttonText('Import')],
    back: testId('account-list-page-back-button'),
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
    // The arrow of the newer confirmations has a class and no test id
    scrollToBottom: `${testId('confirm-scroll-to-bottom')}, .confirm-scroll-to-bottom__button`,
    // The pane the content scrolls in, by its inline style: it has no test id
    scrollPane: '[style*="overflow: auto"]',
  },
  // The older footer, still used by the permission update a network switch
  // asks for, by "Add suggested tokens", and by template confirmations
  pageContainer: {
    confirm: [testId('page-container-footer-next'), testId('confirmation-submit-button'), buttonText('Confirm')],
    cancel: [testId('page-container-footer-cancel'), testId('confirmation-cancel-button'), buttonText('Cancel')],
  },
  // "Switching network will cancel N pending transactions": a warning MetaMask
  // raises after the confirmation is accepted; "Got it" carries on
  alert: {
    acknowledge: [testId('alert-modal-button'), buttonText('Got it')],
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
  // A switch to a network the dapp is allowed on is silent; otherwise MetaMask asks for the permission
  approveSwitchNetwork: selectors.pageContainer.confirm,
  rejectSwitchNetwork: selectors.pageContainer.cancel,
  // wallet_watchAsset
  approveAddToken: selectors.pageContainer.confirm,
  rejectAddToken: selectors.pageContainer.cancel,
  confirmSignature: selectors.confirmation.confirm,
  rejectSignature: selectors.confirmation.cancel,
  confirmTransaction: selectors.confirmation.confirm,
  rejectTransaction: selectors.confirmation.cancel,
};

/** Which screen the extension home page shows, once MetaMask has started. */
async function walletState(page) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await isVisible(page, selectors.onboarding.importWallet, 500)) return 'onboarding';
    if (await isVisible(page, selectors.unlock.password, 500)) return 'locked';
    if (await isVisible(page, selectors.home.header, 500)) return 'unlocked';
  }
  return 'unknown';
}

/** Import a wallet from its seed phrase on a fresh MetaMask install. */
async function onboard(page, { seedPhrase, password, backupAndSync }) {
  const s = selectors.onboarding;
  await click(page, s.importWallet, { timeout: 30000 });
  await click(page, s.importWithSrp);

  await fillSeedPhrase(page, seedPhrase);
  await clickWhenEnabled(page, s.srpConfirm);

  await fill(page, s.newPassword, password);
  await fill(page, s.confirmPassword, password);
  await click(page, s.passwordTerms);
  await clickWhenEnabled(page, s.passwordSubmit);

  await reachHome(page, { password, backupAndSync });
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

async function unlock(page, { password }) {
  await fill(page, selectors.unlock.password, password);
  await click(page, selectors.unlock.submit);
  await reachHome(page, { password });
}

/**
 * Go through whatever MetaMask shows until the wallet's home: the screens
 * that may follow the password or an unlock (passkey, analytics, "download
 * the app", "Done"), and the unlock form if MetaMask locked meanwhile. After
 * "Done", MetaMask takes a moment to record the onboarding as complete and
 * redirects to it until then, so the home page is reloaded.
 */
async function reachHome(page, { password, backupAndSync }) {
  const s = selectors.onboarding;
  const deadline = Date.now() + 90000;
  let syncTurnedOff = false;
  while (Date.now() < deadline) {
    if (await isVisible(page, selectors.home.header, 500)) return;
    if (await isVisible(page, s.passkeyMaybeLater, 500)) await click(page, s.passkeyMaybeLater);
    if (await isVisible(page, s.metricsCheckbox, 500)) {
      await optOutOfMetrics(page);
      await click(page, s.metricsContinue);
    }
    if (await isVisible(page, s.downloadAppContinue, 500)) await click(page, s.downloadAppContinue);
    if (backupAndSync === false && !syncTurnedOff && (await isVisible(page, s.manageDefaultSettings, 500))) {
      await turnOffBackupAndSync(page);
      syncTurnedOff = true;
    }
    if (await isVisible(page, s.done, 500)) {
      await click(page, s.done);
      await sleep(1000);
      await reloadHome(page);
    }
    if (await isVisible(page, selectors.unlock.password, 500)) {
      await fill(page, selectors.unlock.password, password);
      await click(page, selectors.unlock.submit);
    }
  }
  throw await failure(page, 'MetaMask did not show the wallet');
}

// Backup and sync restores, for a seed phrase, the accounts and contacts saved
// from other installs. Off, every import starts from the same state.
async function turnOffBackupAndSync(page) {
  const s = selectors.onboarding;
  await click(page, s.manageDefaultSettings);
  await click(page, s.generalSettings);
  const toggle = await waitFor(page, s.backupAndSyncToggle);
  const on = await toggle.evaluate((el) => el.closest('.toggle-button')?.classList.contains('toggle-button--on') ?? el.className.includes('--on'));
  if (on) await toggle.click();
  await click(page, s.categoryBack);
  await click(page, s.settingsBack);
}

async function optOutOfMetrics(page) {
  const checkbox = await waitFor(page, selectors.onboarding.metricsCheckbox);
  const checked = await checkbox.evaluate((el) => el.getAttribute('data-checked') === 'true');
  if (checked) await checkbox.click();
}

// Through about:blank: dropping only the "#" part of the URL would be a
// same-document navigation, which goto() waits on forever
async function reloadHome(page) {
  const homeUrl = page.url().split('#')[0];
  await page.goto('about:blank');
  await page.goto(homeUrl);
}

/**
 * Add an account to the wallet and select it. Yields its name, "Account N".
 * A click that lands while the list is still settling is lost, so the button
 * is pressed again when no account shows up.
 */
async function addAccount(page) {
  await click(page, selectors.home.accountMenu);
  const before = await accountNames(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    const added = (await newAccount(page, before, 0)) || (await pressAddAccount(page, before));
    if (added) {
      await selectAccount(page, added);
      return added;
    }
  }
  throw await failure(page, 'MetaMask added no account');
}

async function pressAddAccount(page, before) {
  await clickWhenEnabled(page, selectors.accounts.add, { timeout: 30000 });
  return newAccount(page, before, 15000);
}

/** The name of an account that wasn't in `before`, within `timeout` ms. */
async function newAccount(page, before, timeout) {
  const deadline = Date.now() + timeout;
  do {
    const [added] = (await accountNames(page)).filter((name) => !before.includes(name));
    if (added) return added;
    await sleep(250);
  } while (Date.now() < deadline);
  return null;
}

async function accountNames(page) {
  await waitFor(page, selectors.accounts.name);
  return page.$$eval(selectors.accounts.name, (cells) => cells.map((cell) => cell.textContent.trim()));
}

/** Make `name` the selected account of the wallet. */
async function switchAccount(page, name) {
  await click(page, selectors.home.accountMenu);
  await selectAccount(page, name);
}

// Picking an account closes the list and shows it in the home header. As with
// adding one, a lost click leaves the list open, so the account is pressed again.
async function selectAccount(page, name) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await click(page, selectors.accounts.cell(name));
    if (await isSelected(page, name, 5000)) return;
  }
  throw await failure(page, `MetaMask did not select "${name}"`);
}

async function isSelected(page, name, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await selectedAccount(page)) === name) return true;
    await sleep(250);
  }
  return false;
}

async function selectedAccount(page) {
  const menu = await page.$(selectors.home.accountMenu);
  return menu ? menu.evaluate((el) => el.textContent.trim()) : null;
}

/** Import an account from its private key and select it. Yields its name. */
async function importAccount(page, privateKey) {
  await waitFor(page, selectors.home.accountMenu);
  const before = await selectedAccount(page);
  // Straight to the form the account list's "Add wallet" menu leads to
  const homeUrl = page.url().split('#')[0];
  await page.goto('about:blank');
  await page.goto(`${homeUrl}#/add-wallet-page`);
  await fill(page, selectors.accounts.privateKey, privateKey, { timeout: 30000 });
  await clickWhenEnabled(page, selectors.accounts.importConfirm);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const selected = await selectedAccount(page);
    if (selected && selected !== before) return selected;
    await sleep(250);
  }
  throw await failure(page, 'MetaMask did not import the account');
}

/** Press the button of `decision` on the confirmation shown on `page`. */
function decide(decision, page, timeout) {
  return pressAndWaitForDismissal(page, decisions[decision], timeout);
}

/** wallet_addEthereumChain on a network MetaMask knows behaves like a switch: either prompt may show. */
function approveNetworkChange(page, timeout) {
  return pressAndWaitForDismissal(page, [...selectors.confirmation.confirm, ...selectors.pageContainer.confirm], timeout);
}

/**
 * Press a footer button, then wait for the confirmation to go away: the
 * popup closes, the side panel goes back to the home screen. A click that
 * lands while the confirmation is still settling is lost, so the click is
 * repeated while the button stays. If it stays anyway, the error says
 * whether it is the same request or a new one the dapp sent meanwhile, and
 * what MetaMask logged.
 */
async function pressAndWaitForDismissal(page, button, timeout) {
  await waitFor(page, button, { timeout });
  await dismissModal(page);
  const logged = recordErrors(page);
  const request = page.url();
  try {
    await clickWhenEnabled(page, button, { whileDisabled: () => scrollContentToEnd(page) });
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await isVisible(page, selectors.alert.acknowledge, 500)) await click(page, selectors.alert.acknowledge);
      if (await isGone(page, button, 3000)) return;
      await dismissModal(page);
      await dispatchClick(page, button, { timeout: 3000 }).catch(() => {});
    }
    const what = page.url() === request ? 'MetaMask kept the same request open' : 'MetaMask shows a new request: the dapp asked again';
    const distinct = [...new Set(logged.errors)].slice(-3);
    const errors = distinct.length ? `MetaMask logged: ${distinct.join(' | ')}` : 'MetaMask logged no error';
    throw await failure(page, `"${describe(button)}" is still showing after being clicked. ${what}. ${errors}`);
  } finally {
    logged.stop();
  }
}

/** Collect the errors MetaMask's page logs to its console, until stop(). */
function recordErrors(page) {
  const errors = [];
  const onConsole = (message) => {
    if (message.type() === 'error') errors.push(message.text().slice(0, 300));
  };
  const onPageError = (error) => errors.push(String(error.message || error).slice(0, 300));
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return {
    errors,
    stop() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
  };
}

/**
 * MetaMask keeps the button of a confirmation disabled until its content was
 * read to the end: scrolled to the bottom, or not scrollable at all. Some
 * screens offer a button for that, most don't, so the content is scrolled
 * with the wheel, as a reader would. The popup, being small, needs it often.
 */
async function scrollContentToEnd(page) {
  const scrollButton = await page.$(selectors.confirmation.scrollToBottom);
  if (scrollButton) {
    await scrollButton.click().catch(() => {});
    return;
  }
  // The pane itself, to its end: that fires the scroll event MetaMask listens to
  await page
    .$$eval(selectors.confirmation.scrollPane, (panes) => {
      for (const pane of panes) {
        if (pane.scrollHeight > pane.clientHeight) pane.scrollTop = pane.scrollHeight;
      }
    })
    .catch(() => {});
  // And the wheel over the content, for a pane styled otherwise
  const [width, height] = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.clientHeight]);
  await page.mouse.move(Math.round(width / 2), Math.round(height / 2));
  await page.mouse.wheel({ deltaY: 10000 });
}

/** Close a modal shown over the confirmation (Escape, or its last button: "Cancel"). */
async function dismissModal(page) {
  if (!(await isVisible(page, selectors.modal.content, 300))) return;
  await page.keyboard.press('Escape');
  if (await isGone(page, selectors.modal.content, 1000)) return;
  await dispatchClick(page, selectors.modal.lastButton);
}

module.exports = { decisions, walletState, onboard, unlock, addAccount, switchAccount, importAccount, decide, approveNetworkChange };
