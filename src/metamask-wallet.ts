// The wallet's own screens, from its full-screen home page: the onboarding
// and the unlock form, the account list, the menu with its lock and its
// permissions. Each flow goes from screen to screen as MetaMask shows them,
// and fails with the screen in hand.

import type { Page, Target } from 'puppeteer-core';
import { waitFor, waitForGone, waitUntil, isShown, firstOf, fill, failure, type Selector } from './page-helpers';
import { selectors } from './metamask-selectors';
import { openPastModals, press, pressWhenEnabled } from './metamask-overlays';
import type { ResolvedOptions, WalletState } from './types';

/** Which screen the extension home page shows, once MetaMask has started. */
export async function walletState(page: Page): Promise<WalletState | 'unknown'> {
  const screens = { onboarding: selectors.onboarding.importWallet, locked: selectors.unlock.submit, unlocked: selectors.home.header } as const;
  return firstOf(page, screens).catch(() => 'unknown' as const);
}

/** Import a wallet from its seed phrase on a fresh MetaMask install. */
export async function onboard(
  page: Page,
  { seedPhrase, password, backupAndSync }: Pick<ResolvedOptions, 'seedPhrase' | 'password' | 'backupAndSync'>,
): Promise<void> {
  const s = selectors.onboarding;
  await press(page, s.importWallet);
  await press(page, s.importWithSrp);

  await fillSeedPhrase(page, seedPhrase);
  await pressWhenEnabled(page, s.srpConfirm);

  await fill(page, s.newPassword, password);
  await fill(page, s.confirmPassword, password);
  await press(page, s.passwordTerms);
  await pressWhenEnabled(page, s.passwordSubmit);

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

async function submitPassword(page: Page, password: string): Promise<void> {
  await fill(page, selectors.unlock.password, password);
  await press(page, selectors.unlock.submit);
  await waitForGone(page, selectors.unlock.submit);
}

/**
 * A page that was showing the unlock form when the wallet got unlocked from
 * another one keeps showing it, and the dapp's requests wait behind it. The
 * password is given there too, as a user would; what follows is the wallet
 * or a request, so only the form is watched.
 */
export async function leaveUnlockForm(page: Page, { password }: Pick<ResolvedOptions, 'password'>): Promise<void> {
  if (await isShown(page, selectors.unlock.submit)) await submitPassword(page, password);
}

/**
 * Go through whatever MetaMask shows until the wallet's home: the screens
 * that may follow the password or an unlock (passkey, analytics, "download
 * the app", "Done"), and the unlock form if MetaMask locked meanwhile. Each
 * is handled once and waited for to go: one that shows again is a failure.
 */
async function reachHome(page: Page, { password, backupAndSync }: { password: string; backupAndSync?: boolean }): Promise<void> {
  const s = selectors.onboarding;
  const handled = new Set<string>();
  for (;;) {
    const screens: Record<string, Selector> = {
      home: selectors.home.header,
      passkey: s.passkeyMaybeLater,
      metrics: s.metricsCheckbox,
      downloadApp: s.downloadAppContinue,
      // Next to "Done", and to be done first: the settings lead back to it
      ...(backupAndSync === false && !handled.has('settings') ? { settings: s.manageDefaultSettings } : {}),
      done: s.done,
      unlock: selectors.unlock.submit,
    };
    const screen = await firstOf(page, screens);
    if (screen === 'home') return;
    if (handled.has(screen)) throw await failure(page, `MetaMask showed its "${screen}" screen again`);
    handled.add(screen);
    if (screen === 'passkey') await press(page, s.passkeyMaybeLater);
    if (screen === 'metrics') await optOutOfMetrics(page);
    if (screen === 'downloadApp') await press(page, s.downloadAppContinue);
    if (screen === 'settings') await turnOffBackupAndSync(page);
    if (screen === 'done') await finishOnboarding(page);
    if (screen === 'unlock') await submitPassword(page, password);
    if (screen !== 'settings' && screen !== 'unlock' && screen !== 'done') await waitForGone(page, screens[screen]);
  }
}

/**
 * Press "Done". MetaMask records the onboarding as complete, which takes it
 * a moment, then opens the wallet in its side panel, and leaves this page on
 * the last onboarding screen: once the side panel is there, the home page is
 * loaded again, and shows the wallet. Loaded before, it routes back to the
 * onboarding, and a reload while MetaMask records it cuts it short.
 */
async function finishOnboarding(page: Page): Promise<void> {
  const browser = page.browser();
  const isSidePanel = (target: Target) => target.type() === 'page' && target.url().includes('/sidepanel.html');
  const before = new Set(browser.targets().filter(isSidePanel));
  await press(page, selectors.onboarding.done);
  await browser
    .waitForTarget((target) => isSidePanel(target) && !before.has(target), { timeout: page.getDefaultTimeout() })
    .catch(async () => {
      throw await failure(page, 'MetaMask did not open its side panel after "Done"');
    });
  await reloadHome(page);
  await waitFor(page, selectors.home.header);
}

// Backup and sync restores, for a seed phrase, the accounts and contacts saved
// from other installs. Off, every import starts from the same state. The
// settings lead back to the last onboarding screen.
async function turnOffBackupAndSync(page: Page): Promise<void> {
  const s = selectors.onboarding;
  await press(page, s.manageDefaultSettings);
  await press(page, s.generalSettings);
  const toggle = await waitFor(page, s.backupAndSyncToggle);
  const on = await toggle.evaluate((el) => el.closest('.toggle-button')?.classList.contains('toggle-button--on') ?? el.className.includes('--on'));
  if (on) await press(page, s.backupAndSyncSwitch);
  await press(page, s.categoryBack);
  await press(page, s.settingsBack);
  await waitFor(page, s.done);
}

async function optOutOfMetrics(page: Page): Promise<void> {
  const checkbox = await waitFor(page, selectors.onboarding.metricsCheckbox);
  if (await checkbox.evaluate((el) => el.getAttribute('data-checked') === 'true')) await press(page, selectors.onboarding.metricsCheckbox);
  await press(page, selectors.onboarding.metricsContinue);
}

/** Add an account to the wallet and select it. Yields its name, "Account N". */
export async function addAccount(page: Page): Promise<string> {
  await openAccountList(page);
  const before = await accountNames(page);
  await pressWhenEnabled(page, selectors.accounts.add);
  let added: string | undefined;
  await waitUntil(page, 'MetaMask to add an account', async () => {
    [added] = (await accountNames(page)).filter((name) => !before.includes(name));
    return added !== undefined;
  });
  await selectAccount(page, added!);
  return added!;
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

async function openAccountList(page: Page): Promise<void> {
  await page.bringToFront();
  await openPastModals(page, selectors.home.accountMenu, selectors.accounts.name);
}

// Picking an account closes the list and shows it in the home header
async function selectAccount(page: Page, name: string): Promise<void> {
  await press(page, selectors.accounts.cell(name));
  await waitUntil(page, `"${name}" to be the selected account`, async () => (await selectedAccount(page)) === name);
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
  await fill(page, selectors.accounts.privateKey, privateKey);
  await pressWhenEnabled(page, selectors.accounts.importConfirm);
  let imported: string | null = null;
  await waitUntil(page, 'MetaMask to import the account', async () => {
    imported = await selectedAccount(page);
    return imported !== null && imported !== before;
  });
  return imported!;
}

// Reload the home page, on `route` if one is given. Through about:blank:
// changing only the "#" part of the URL would be a same-document navigation,
// which goto() waits on forever
async function reloadHome(page: Page, route = ''): Promise<void> {
  const homeUrl = page.url().split('#')[0];
  await page.goto('about:blank');
  await page.goto(`${homeUrl}${route}`);
}

/** Lock the wallet from the menu of its home page. Nothing to do on a wallet already locked. */
export async function lock(page: Page): Promise<void> {
  if ((await walletState(page)) === 'locked') return;
  await openMenu(page);
  await press(page, selectors.menu.lock);
  await waitFor(page, selectors.unlock.submit);
}

async function openMenu(page: Page): Promise<void> {
  await page.bringToFront();
  await openPastModals(page, selectors.menu.open, selectors.menu.lock);
}

/**
 * Disconnect the site at `origin` from the wallet, on its page of the
 * "Permissions" screen. The dapp gets an empty accountsChanged.
 */
export async function disconnectSite(page: Page, origin: string): Promise<void> {
  const s = selectors.permissions;
  const { host } = new URL(origin);
  await openConnections(page);
  await waitFor(page, s.site(host)).catch(async () => {
    throw await failure(page, `MetaMask lists no connection to "${host}"`);
  });
  await press(page, s.site(host));
  await press(page, s.disconnect);
  await press(page, s.confirmDisconnect);
  // Disconnecting goes back to the list, without the site
  await waitForGone(page, [...s.confirmDisconnect, ...s.disconnect]);
  await waitForGone(page, s.site(host));
}

/** The list of connected sites, from the menu's "Permissions". */
async function openConnections(page: Page): Promise<void> {
  const s = selectors.permissions;
  await openMenu(page);
  await press(page, selectors.menu.permissions);
  // A wallet that also holds token permissions shows a hub first; it goes on
  // to the list by itself when there is nothing else to show
  if ((await firstOf(page, { list: s.list, hub: s.hub })) === 'list') return;
  if ((await firstOf(page, { list: s.list, connections: s.connections })) === 'connections') await press(page, s.connections);
  await waitFor(page, s.list);
}
