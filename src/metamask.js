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
const linkText = (text) => `xpath/.//a[normalize-space(.)="${text}"]`;
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
  // The menu of the home header, a drawer: settings, permissions, lock
  menu: {
    open: [testId('account-options-menu-button'), 'button[aria-label="Account options"]'],
    lock: [testId('global-menu-lock'), buttonText('Lock')],
    permissions: [testId('global-menu-connected-sites'), linkText('Permissions')],
  },
  // "Permissions": the sites connected to the wallet, then the page of one site
  permissions: {
    list: testId('parent-selector-permission-list'),
    // Shown first when the wallet also holds token permissions; "Connections" leads to the list
    hub: testId('parent-selector-gator-permissions'),
    connections: 'xpath/.//p[normalize-space(.)="Connections"]',
    // A site is listed by its host, "localhost:3000"
    site: (host) => [
      `xpath/.//*[@data-testid="connection-list-item"][.//p[normalize-space(.)="${host}"]]`,
      `xpath/.//p[normalize-space(.)="${host}"]`,
    ],
    disconnect: [testId('disconnect-button'), 'button[aria-label="Disconnect"]'],
    // "Disconnect", in the modal that asks to confirm
    confirmDisconnect: [testId('disconnect-all'), `xpath/.//*[@data-testid="disconnect-all-modal"]//button[normalize-space(.)="Disconnect"]`],
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
  // What a transaction lets its reader change before confirming it: the
  // spending cap of an ERC-20 approval, and the network fee
  transaction: {
    // The pencil of the "Spending cap" row, before the amount it edits
    editSpendingCap: [testId('edit-spending-cap-icon'), 'xpath/.//button[@aria-label="Edit"][following::*[@data-testid="simulation-token-value"]]'],
    spendingCap: testId('simulation-token-value'),
    spendingCapInput: [testId('custom-spending-cap-input'), '.edit-spending-cap-modal input'],
    // "Save", the last button of the modal's footer: it has no test id
    spendingCapSave: ['.edit-spending-cap-modal .mm-modal-footer__button:last-child', 'xpath/.//*[contains(@class, "edit-spending-cap-modal")]//button[normalize-space(.)="Save"]'],
    // The pencil of the "Network fee" row opens the fee editor: a list of
    // estimates, whose last entry, "Advanced", leads to a form
    editGas: [testId('edit-gas-fee-icon'), `${testId('gas-fee-section')} button[aria-label="Edit"]`],
    gasEstimates: testId('gas-fee-estimates-modal'),
    gasOption: (key, label) => [testId(`gas-option-${key}`), `xpath/.//*[@data-testid="gas-fee-estimates-modal"]//p[normalize-space(.)="${label}"]`],
    gasForm: testId('gas-fee-advanced-eip1559-modal'),
    gasField: (id) => [`#${id}`, `${testId(id)} input`],
    gasSave: [testId('gas-fee-modal-save-button'), buttonText('Save')],
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
    // The cross of the modal's header, when it has one
    close: '.mm-modal-content button[aria-label="Close"]',
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
  await submitPassword(page, password);
  await reachHome(page, { password });
}

async function submitPassword(page, password) {
  await fill(page, selectors.unlock.password, password);
  await click(page, selectors.unlock.submit);
}

/**
 * A page that was showing the unlock form when the wallet got unlocked from
 * another one keeps showing it, and the dapp's requests wait behind it. The
 * password is given there too, as a user would; what follows is the wallet
 * or a request, so only the form is watched.
 */
async function leaveUnlockForm(page, { password }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await isVisible(page, selectors.unlock.password, 500))) return;
    await submitPassword(page, password);
    if (await isGone(page, selectors.unlock.password, 10000)) return;
  }
  throw await failure(page, 'MetaMask kept showing its unlock form');
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
    if (await isVisible(page, selectors.unlock.password, 500)) await submitPassword(page, password);
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
  await openAccountList(page);
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
  await openAccountList(page);
  await selectAccount(page, name);
}

// A click on the menu is lost while the home screen settles, as with the
// buttons in the list, or swallowed by a modal MetaMask shows over the home
// screen after some activity (the Transaction Shield offer, for one): any
// modal is dismissed first, and the menu is pressed again until the list shows.
async function openAccountList(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    // Back in front: a tab something opened meanwhile would hide this page and stall its rendering
    await page.bringToFront().catch(() => {});
    await dismissModal(page);
    await click(page, selectors.home.accountMenu);
    if (await isVisible(page, selectors.accounts.name, 10000)) return;
  }
  throw await failure(page, 'MetaMask did not open the account list');
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

/** Lock the wallet from the menu of its home page. Nothing to do on a wallet already locked. */
async function lock(page) {
  if ((await walletState(page)) === 'locked') return;
  for (let attempt = 0; attempt < 3; attempt++) {
    await openMenu(page);
    await click(page, selectors.menu.lock);
    if (await isVisible(page, selectors.unlock.password, 10000)) return;
  }
  throw await failure(page, 'MetaMask did not lock');
}

// As with the account list, a click on the menu is lost while the home screen
// settles or swallowed by a modal, so it is pressed again until the menu shows.
async function openMenu(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.bringToFront().catch(() => {});
    await dismissModal(page);
    await click(page, selectors.menu.open);
    if (await isVisible(page, selectors.menu.lock, 5000)) return;
  }
  throw await failure(page, 'MetaMask did not open its menu');
}

/**
 * Disconnect the site at `origin` from the wallet, on its page of the
 * "Permissions" screen. The dapp gets an empty accountsChanged.
 */
async function disconnectSite(page, origin) {
  const s = selectors.permissions;
  const { host } = new URL(origin);
  await openConnections(page);
  if (!(await isVisible(page, s.site(host), 5000))) throw await failure(page, `MetaMask lists no connection to "${host}"`);
  await openSite(page, host);
  // Disconnecting goes back to the list, without the site. A lost click
  // leaves the site's page or the modal showing, and is pressed again.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await isVisible(page, s.confirmDisconnect, 500))) await click(page, s.disconnect);
    if (!(await isVisible(page, s.confirmDisconnect, 5000))) continue;
    await click(page, s.confirmDisconnect);
    if ((await isGone(page, [...s.confirmDisconnect, ...s.disconnect], 5000)) && (await isGone(page, s.site(host), 5000))) return;
  }
  throw await failure(page, `MetaMask did not disconnect "${host}"`);
}

/** The list of connected sites, from the menu's "Permissions". */
async function openConnections(page) {
  const s = selectors.permissions;
  for (let attempt = 0; attempt < 3; attempt++) {
    await openMenu(page);
    await click(page, selectors.menu.permissions);
    if (!(await isVisible(page, [s.list, s.hub], 10000))) continue;
    if (await isVisible(page, s.list, 500)) return;
    // The hub goes on to the list by itself when there is nothing else to show
    if (await isVisible(page, s.connections, 3000)) await click(page, s.connections);
    if (await isVisible(page, s.list, 10000)) return;
  }
  throw await failure(page, 'MetaMask did not open its permissions');
}

async function openSite(page, host) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await click(page, selectors.permissions.site(host));
    if (await isVisible(page, selectors.permissions.disconnect, 5000)) return;
  }
  throw await failure(page, `MetaMask did not open the permissions of "${host}"`);
}

// What a command sets on its confirmation before pressing the button, when the
// test passed it options: adjustments[command](page, options, timeout)
const adjustments = {};

/** Press the button of `decision` on the confirmation shown on `page`, once it is set as `options` ask. */
async function decide(decision, page, timeout, options) {
  if (options) {
    const adjust = adjustments[decision];
    if (!adjust) throw new Error(`[dappress] ${decision} takes no options`);
    await waitFor(page, decisions[decision], { timeout });
    await adjust(page, options, timeout);
  }
  return pressAndWaitForDismissal(page, decisions[decision], timeout);
}

/** wallet_addEthereumChain on a network MetaMask knows behaves like a switch: either prompt may show. */
function approveNetworkChange(page, timeout) {
  return pressAndWaitForDismissal(page, [...selectors.confirmation.confirm, ...selectors.pageContainer.confirm], timeout);
}

// The estimates of the fee editor, by the name MetaMask shows: its test id and its English label
const gasEstimates = { low: ['low', 'Low'], market: ['medium', 'Market'], aggressive: ['high', 'Aggressive'], networkSuggested: ['gasPrice', 'Network suggested'] };
// The fields of the fee editor's advanced form, by the name MetaMask labels them with
const gasFields = { maxBaseFee: 'max-base-fee-input', priorityFee: 'priority-fee-input', gasLimit: 'gas-input' };

/**
 * Set what the test asked of a transaction before it is confirmed. The cap
 * goes first: saving it makes MetaMask estimate the gas limit again.
 */
async function adjustTransaction(page, options) {
  const { spendingCap, gas, ...unknown } = options;
  const [stray] = Object.keys(unknown);
  if (stray) throw new Error(`[dappress] confirmTransaction takes spendingCap and gas, not "${stray}"`);
  const cap = spendingCap === undefined ? undefined : amount(spendingCap, 'spendingCap');
  const fee = gas === undefined ? undefined : gasChoice(gas);
  await dismissModal(page);
  if (cap !== undefined) await setSpendingCap(page, cap);
  if (fee !== undefined) await setGas(page, fee);
}

// An amount as a user types it, "5" or "2.5", from a number or a string
function amount(value, name) {
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`[dappress] ${name} is an amount such as 5 or '2.5', not ${JSON.stringify(value)}`);
  return text;
}

// The estimate to pick, or the fields of the advanced form to fill with what
function gasChoice(gas) {
  if (typeof gas === 'string') {
    if (!gasEstimates[gas]) throw new Error(`[dappress] gas is ${Object.keys(gasEstimates).join(', ')} or custom values, not "${gas}"`);
    return gas;
  }
  const fields = Object.keys(gas || {});
  const [stray] = fields.filter((field) => !gasFields[field]);
  if (stray || !fields.length) throw new Error(`[dappress] Custom gas takes ${Object.keys(gasFields).join(', ')}, not ${stray ? `"${stray}"` : 'nothing'}`);
  return Object.fromEntries(fields.map((field) => [field, amount(gas[field], `gas.${field}`)]));
}

/**
 * Set the amount an ERC-20 approval lets the spender use, in tokens, from the
 * pencil of its "Spending cap" row. The row shows once MetaMask has read the
 * token, and only an ERC-20 approval has one.
 */
async function setSpendingCap(page, cap) {
  const s = selectors.transaction;
  if (!(await isVisible(page, s.editSpendingCap, 10000))) throw await failure(page, 'MetaMask shows no spending cap to edit: spendingCap is for an ERC-20 approval');
  const shown = await textOf(page, s.spendingCap);
  const asked = await openSpendingCap(page);
  await type(page, s.spendingCapInput, cap, 'spending cap');
  if (!(await pressToClose(page, s.spendingCapSave, s.spendingCapInput))) throw await failure(page, `MetaMask did not save the spending cap of ${cap}`);
  // The modal closes before the confirmation has the new cap, and confirming
  // meanwhile approves the old one. Two caps may read the same once MetaMask
  // has rounded them, so a row that stays as it was is not a failure.
  const deadline = Date.now() + (Number(asked) === Number(cap) ? 0 : 5000);
  while (Date.now() < deadline && (await textOf(page, s.spendingCap)) === shown) await sleep(250);
}

/** Open the spending cap's modal. Yields the cap the dapp asked for, which its field starts with. */
async function openSpendingCap(page) {
  const s = selectors.transaction;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await isVisible(page, s.spendingCapInput, 500))) await click(page, s.editSpendingCap);
    if (await isVisible(page, s.spendingCapInput, 5000)) return valueOf(page, s.spendingCapInput);
  }
  throw await failure(page, 'MetaMask did not open the spending cap');
}

/**
 * Set the network fee in the fee editor, opened from the pencil of the
 * "Network fee" row: one of its estimates, or the values of its advanced form.
 */
async function setGas(page, gas) {
  const s = selectors.transaction;
  if (!(await isVisible(page, s.editGas, 10000))) throw await failure(page, 'MetaMask shows no network fee to edit on this confirmation');
  await openFeeEditor(page);
  if (typeof gas === 'string') await pickGasEstimate(page, gas);
  else await fillGasForm(page, gas);
}

async function openFeeEditor(page) {
  const s = selectors.transaction;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await isVisible(page, s.gasEstimates, 500))) await click(page, s.editGas);
    if (await isVisible(page, s.gasEstimates, 5000)) return;
  }
  throw await failure(page, 'MetaMask did not open its fee editor');
}

// Picking an estimate closes the editor. MetaMask lists the estimates it has
// for the network: Low, Market and Aggressive where it has fee estimates,
// "Network suggested" where it only has a gas price, as on a local node.
async function pickGasEstimate(page, name) {
  const s = selectors.transaction;
  const option = s.gasOption(...gasEstimates[name]);
  if (!(await isVisible(page, option, 5000))) throw await failure(page, `MetaMask offers no "${name}" fee for this transaction`);
  for (let attempt = 0; attempt < 3; attempt++) {
    await click(page, option);
    if (await isGone(page, s.gasEstimates, 10000)) return;
  }
  throw await failure(page, `MetaMask did not take the "${name}" fee`);
}

async function fillGasForm(page, values) {
  const s = selectors.transaction;
  await openGasForm(page);
  // The form checks each fee against the other as it stood, and keeps the old
  // value of a fee it refused: the max base fee is typed again once the
  // priority fee is in, for two fees that both move below or above the old ones.
  const fields = Object.keys(gasFields).filter((field) => values[field] !== undefined);
  if (values.maxBaseFee !== undefined && values.priorityFee !== undefined) fields.push('maxBaseFee');
  for (const field of fields) await type(page, s.gasField(gasFields[field]), values[field], field);
  // "Save" stays disabled on a value the form refuses, and the error quotes what the form says of it
  if (!(await pressToClose(page, s.gasSave, s.gasForm))) throw await failure(page, 'MetaMask did not save the network fee');
}

// "Advanced", in the list of estimates, replaces the list with the form. A
// transaction with a gas price gets another form, which has none of these fields.
async function openGasForm(page) {
  const s = selectors.transaction;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await isVisible(page, s.gasForm, 500))) await click(page, s.gasOption('advanced', 'Advanced'));
    if (await isVisible(page, s.gasForm, 5000)) return;
  }
  throw await failure(page, 'MetaMask did not open the advanced fee form of an EIP-1559 transaction');
}

// Type into a field and read it back: keys pressed while MetaMask re-renders are lost
async function type(page, selector, text, what) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await fill(page, selector, text);
    if (Number(await valueOf(page, selector)) === Number(text)) return;
  }
  throw await failure(page, `MetaMask's field for the ${what} did not take "${text}"`);
}

// Press the button that saves a modal until the modal closes: a lost click leaves it open
async function pressToClose(page, button, content) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await clickWhenEnabled(page, button);
    if (await isGone(page, content, 10000)) return true;
  }
  return false;
}

async function valueOf(page, selector) {
  const field = await waitFor(page, selector);
  return field.evaluate((el) => el.value);
}

async function textOf(page, selector) {
  const element = await page.$(selector);
  return element ? element.evaluate((el) => el.textContent.trim()).catch(() => null) : null;
}

adjustments.confirmTransaction = adjustTransaction;

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

/**
 * Close a modal shown over the screen: Escape, then the cross of its header,
 * then its last button, which is "Cancel" on the "multiple requests" modal.
 * The last button is the last resort: on an offer such as Transaction
 * Shield's, it is a call to action that opens a page, which hides this one.
 */
async function dismissModal(page) {
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

module.exports = {
  decisions,
  walletState,
  onboard,
  unlock,
  leaveUnlockForm,
  lock,
  addAccount,
  switchAccount,
  importAccount,
  disconnectSite,
  decide,
  approveNetworkChange,
};
