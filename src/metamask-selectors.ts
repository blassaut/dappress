// MetaMask's screens: what to click, by which selector.
//
// Selectors come from MetaMask's own end-to-end page objects
// (test/e2e/page-objects in the metamask-extension repository), which MetaMask
// has to keep working for its own test suite. Each entry lists the data-testid
// first, then a fallback on the button's English text. When a MetaMask release
// moves something, this is the file to fix; the flows that click through the
// screens are in metamask-wallet.ts, metamask-confirmation.ts and
// metamask-transaction.ts.

const testId = (id: string) => `[data-testid="${id}"]`;
// XPath rather than Puppeteer's ::-p-text(): the latter needs MutationObserver,
// which MetaMask's sandbox (LavaMoat) blocks in its pages.
const buttonText = (text: string) => `xpath/.//button[normalize-space(.)="${text}"]`;
const linkText = (text: string) => `xpath/.//a[normalize-space(.)="${text}"]`;
const passwordInput = (position: number) => `xpath/(.//input[@type="password"])[${position}]`;

export const selectors = {
  onboarding: {
    importWallet: [testId('onboarding-import-wallet'), buttonText('I have an existing wallet')],
    importWithSrp: [testId('onboarding-import-with-srp-button'), buttonText('Import using Secret Recovery Phrase')],
    srpInput: testId('srp-input-import__srp-note'),
    srpWord: (index: number) => testId(`import-srp__srp-word-${index}`),
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
    site: (host: string) => [`xpath/.//*[@data-testid="connection-list-item"][.//p[normalize-space(.)="${host}"]]`, `xpath/.//p[normalize-space(.)="${host}"]`],
    disconnect: [testId('disconnect-button'), 'button[aria-label="Disconnect"]'],
    // "Disconnect", in the modal that asks to confirm
    confirmDisconnect: [testId('disconnect-all'), `xpath/.//*[@data-testid="disconnect-all-modal"]//button[normalize-space(.)="Disconnect"]`],
  },
  // The account list, opened from the home header
  accounts: {
    name: '[data-testid^="multichain-account-cell-name-"]',
    cell: (name: string) => `xpath/.//*[contains(@class, "multichain-account-cell")][.//*[@data-testid="multichain-account-cell-name-${name}"]]`,
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
  // The accounts of a connection: the request names the one it suggests, and
  // pressing it opens the list of the wallet's accounts, a checkbox on each
  connectAccounts: {
    // The suggested account, or their count when there are several
    edit: [testId('account-selection-section'), '[data-testid="parent-selector-connect-page"] .multichain-account-cell, [data-testid^="accounts-count-"]'],
    checkbox: (name: string) =>
      `xpath/.//*[contains(@class, "multichain-account-cell")][.//*[@data-testid="multichain-account-cell-name-${name}"]]//input[@type="checkbox"]`,
    save: [testId('connect-more-accounts-button'), buttonText('Save')],
    // What the request shows once the list is saved: the account alone, or how many there are
    chosen: (names: string[]) =>
      names.length === 1
        ? `[data-testid="parent-selector-connect-page"] [data-testid="multichain-account-cell-name-${names[0]}"]`
        : testId(`accounts-count-${names.length}`),
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
    spendingCapSave: [
      '.edit-spending-cap-modal .mm-modal-footer__button:last-child',
      'xpath/.//*[contains(@class, "edit-spending-cap-modal")]//button[normalize-space(.)="Save"]',
    ],
    // The pencil of the "Network fee" row opens the fee editor: a list of
    // estimates, whose last entry, "Advanced", leads to a form
    editGas: [testId('edit-gas-fee-icon'), `${testId('gas-fee-section')} button[aria-label="Edit"]`],
    gasEstimates: testId('gas-fee-estimates-modal'),
    gasOption: (key: string, label: string) => [
      testId(`gas-option-${key}`),
      `xpath/.//*[@data-testid="gas-fee-estimates-modal"]//p[normalize-space(.)="${label}"]`,
    ],
    gasForm: testId('gas-fee-advanced-eip1559-modal'),
    gasField: (id: string) => [`#${id}`, `${testId(id)} input`],
    gasSave: [testId('gas-fee-modal-save-button'), buttonText('Save')],
    // The "Network fee" row: its amount and the name of its estimate
    feeSection: testId('gas-fee-section'),
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
    // The cross of the modal's header, when it has one. Its label is translated:
    // the Transaction Shield offer is known by its test id, whatever the language
    close: `${testId('shield-entry-modal-close-button')}, .mm-modal-content button[aria-label="Close"]`,
    lastButton: 'xpath/(.//div[contains(@class, "mm-modal-content")]//button)[last()]',
  },
};

// Which button each command presses on the confirmation
export const decisions = {
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

export type Decision = keyof typeof decisions;
