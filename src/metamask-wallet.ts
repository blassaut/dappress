// The wallet's own screens, from its full-screen home page: the onboarding
// and the unlock form, the account list, the menu with its lock and its
// permissions. Each flow presses again a click MetaMask lost while a screen
// settled, and fails with the screen in hand.

import type { Page } from 'puppeteer-core';
import { waitFor, isVisible, isGone, click, clickWhenEnabled, fill, failure, sleep } from './page-helpers';
import { selectors } from './metamask-selectors';
import { dismissModal } from './metamask-modal';
import type { ResolvedOptions, WalletState } from './types';

/** Which screen the extension home page shows, once MetaMask has started. */
export async function walletState(page: Page): Promise<WalletState | 'unknown'> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await isVisible(page, selectors.onboarding.importWallet, 500)) return 'onboarding';
    if (await isVisible(page, selectors.unlock.password, 500)) return 'locked';
    if (await isVisible(page, selectors.home.header, 500)) return 'unlocked';
  }
  return 'unknown';
}

/** Import a wallet from its seed phrase on a fresh MetaMask install. */
export async function onboard(
  page: Page,
  { seedPhrase, password, backupAndSync }: Pick<ResolvedOptions, 'seedPhrase' | 'password' | 'backupAndSync'>,
): Promise<void> {
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
async function fillSeedPhrase(page: Page, seedPhrase: string): Promise<void> {
  const words = seedPhrase.trim().split(/\s+/);
  await fill(page, selectors.onboarding.srpInput, words[0]);
  await page.keyboard.press('Space');
  for (let index = 1; index < words.length; index++) {
    await fill(page, selectors.onboarding.srpWord(index), words[index]);
    if (index < words.length - 1) await page.keyboard.press('Space');
  }
}

export async function unlock(page: Page, { password }: Pick<ResolvedOptions, 'password'>): Promise<void> {
  await submitPassword(page, password);
  await reachHome(page, { password });
}

/** The route of the unlock form, on a wallet locked, or on one whose onboarding MetaMask takes as unfinished. */
export const UNLOCK_ROUTE = /#\/(onboarding\/)?unlock(\?|$)/;

/**
 * Whether `page` shows the unlock form: on its route, or with the form up. A
 * wallet MetaMask locked meanwhile, on its timer or when its background
 * restarted, keeps a dapp's request and its own screens behind the form.
 */
export async function showsUnlockForm(page: Page): Promise<boolean> {
  if (UNLOCK_ROUTE.test(page.url())) return true;
  for (const candidate of selectors.unlock.password) {
    if (await page.$(candidate).catch(() => null)) return true;
  }
  return false;
}

/**
 * Unlock the wallet on its home page when MetaMask locked it meanwhile, as a
 * user would before going on. The page is left to show the wallet or the
 * form first: one just opened shows neither yet. Nothing to do on the wallet.
 */
export async function unlockIfLocked(page: Page, options: Pick<ResolvedOptions, 'password'>): Promise<void> {
  await waitFor(page, [selectors.home.header, ...selectors.unlock.password], { timeout: 20000 }).catch(() => {});
  if (await showsUnlockForm(page)) await unlock(page, options);
}

async function submitPassword(page: Page, password: string): Promise<void> {
  await fill(page, selectors.unlock.password, password);
  await click(page, selectors.unlock.submit);
}

/**
 * A page that was showing the unlock form when the wallet got unlocked from
 * another one keeps showing it, and the dapp's requests wait behind it. The
 * password is given there too, as a user would; what follows is the wallet
 * or a request, so only the form is watched.
 */
export async function leaveUnlockForm(page: Page, { password }: Pick<ResolvedOptions, 'password'>): Promise<void> {
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
async function reachHome(page: Page, { password, backupAndSync }: { password: string; backupAndSync?: boolean }): Promise<void> {
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
async function turnOffBackupAndSync(page: Page): Promise<void> {
  const s = selectors.onboarding;
  await click(page, s.manageDefaultSettings);
  await click(page, s.generalSettings);
  const toggle = await waitFor(page, s.backupAndSyncToggle);
  const on = await toggle.evaluate((el) => el.closest('.toggle-button')?.classList.contains('toggle-button--on') ?? el.className.includes('--on'));
  if (on) await toggle.click();
  await click(page, s.categoryBack);
  await click(page, s.settingsBack);
}

async function optOutOfMetrics(page: Page): Promise<void> {
  const checkbox = await waitFor(page, selectors.onboarding.metricsCheckbox);
  const checked = await checkbox.evaluate((el) => el.getAttribute('data-checked') === 'true');
  if (checked) await checkbox.click();
}

// Reload the home page, on `route` if one is given. Through about:blank:
// changing only the "#" part of the URL would be a same-document navigation,
// which goto() waits on forever
async function reloadHome(page: Page, route = ''): Promise<void> {
  const homeUrl = page.url().split('#')[0];
  await page.goto('about:blank');
  await page.goto(`${homeUrl}${route}`);
}

/**
 * Add an account to the wallet and select it. Yields its name, "Account N".
 * A click that lands while the list is still settling is lost, so the button
 * is pressed again when no account shows up.
 */
export async function addAccount(page: Page): Promise<string> {
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

async function pressAddAccount(page: Page, before: string[]): Promise<string | null> {
  await clickWhenEnabled(page, selectors.accounts.add, { timeout: 30000 });
  return newAccount(page, before, 15000);
}

/** The name of an account that wasn't in `before`, within `timeout` ms. */
async function newAccount(page: Page, before: string[], timeout: number): Promise<string | null> {
  const deadline = Date.now() + timeout;
  do {
    const [added] = (await accountNames(page)).filter((name) => !before.includes(name));
    if (added) return added;
    await sleep(250);
  } while (Date.now() < deadline);
  return null;
}

export async function accountNames(page: Page): Promise<string[]> {
  await waitFor(page, selectors.accounts.name);
  return page.$$eval(selectors.accounts.name, (cells) => cells.map((cell) => (cell.textContent ?? '').trim()));
}

/** Make `name` the selected account of the wallet. */
export async function switchAccount(page: Page, name: string): Promise<void> {
  await openAccountList(page);
  await selectAccount(page, name);
}

// A click on the menu is lost while the home screen settles, as with the
// buttons in the list, or swallowed by a modal MetaMask shows over the home
// screen after some activity (the Transaction Shield offer, for one): any
// modal is dismissed first, and the menu is pressed again until the list shows.
async function openAccountList(page: Page): Promise<void> {
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
async function selectAccount(page: Page, name: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await click(page, selectors.accounts.cell(name));
    if (await isSelected(page, name, 5000)) return;
  }
  throw await failure(page, `MetaMask did not select "${name}"`);
}

async function isSelected(page: Page, name: string, timeout: number): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await selectedAccount(page)) === name) return true;
    await sleep(250);
  }
  return false;
}

async function selectedAccount(page: Page): Promise<string | null> {
  const menu = await page.$(selectors.home.accountMenu);
  return menu ? menu.evaluate((el) => (el.textContent ?? '').trim()) : null;
}

/** Import an account from its private key and select it. Yields its name. */
export async function importAccount(page: Page, privateKey: string): Promise<string> {
  await waitFor(page, selectors.home.accountMenu);
  const before = await selectedAccount(page);
  // Straight to the form the account list's "Add wallet" menu leads to
  await reloadHome(page, '#/add-wallet-page');
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
export async function lock(page: Page): Promise<void> {
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
async function openMenu(page: Page): Promise<void> {
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
export async function disconnectSite(page: Page, origin: string): Promise<void> {
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
async function openConnections(page: Page): Promise<void> {
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

async function openSite(page: Page, host: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await click(page, selectors.permissions.site(host));
    if (await isVisible(page, selectors.permissions.disconnect, 5000)) return;
  }
  throw await failure(page, `MetaMask did not open the permissions of "${host}"`);
}
