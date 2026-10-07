// The Node side of every cy.* command, registered as Cypress tasks. Each
// action gets a Puppeteer browser connected to the Cypress browser, finds the
// MetaMask page it needs and drives it through the metamask-* modules.

import type { Browser, Page } from 'puppeteer-core';
import { withBrowser } from './browser';
import * as metamask from './metamask';
import { findExtensionId, getHomePage, getRequestPages, getConfirmationPage, homePageUrls } from './metamask-pages';
import type { ResolvedOptions, WalletState } from './types';

// The argument is what the command gave cy.task(): it is typed there, in support.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Action = (browser: Browser, argument?: any) => Promise<unknown>;

export function createTasks(options: ResolvedOptions): Cypress.Tasks {
  // Found once: the browser is the same for the whole run
  let extensionId: string | undefined;

  async function metamaskId(browser: Browser): Promise<string> {
    extensionId = extensionId || (await findExtensionId(browser));
    return extensionId;
  }

  /** Onboard the wallet or unlock it, so the dapp can talk to it. Safe to call repeatedly. */
  const setupMetaMask = (browser: Browser) => openWallet(browser, { onboard: true });

  async function openWallet(browser: Browser, { onboard }: { onboard: boolean }): Promise<WalletState> {
    const home = await getHomePage(browser, await metamaskId(browser));
    const state = await metamask.walletState(home);
    console.log(`[dappress] MetaMask is ${state}`);
    if (state === 'onboarding' && onboard) await metamask.onboard(home, options);
    if (state === 'locked') await metamask.unlock(home, options);
    if (state === 'unknown') throw new Error(`[dappress] Unexpected MetaMask screen at ${home.url()}`);
    await closeHome(home);
    return state;
  }

  /**
   * A task that drives the wallet's own screens, from its full-screen page.
   * A wallet MetaMask locked meanwhile is unlocked first, as a user would.
   */
  const onHomePage =
    <A, R>(flow: (home: Page, argument: A) => Promise<R>) =>
    async (browser: Browser, argument: A): Promise<R> => {
      const home = await getHomePage(browser, await metamaskId(browser));
      try {
        await home.bringToFront();
        await metamask.unlockIfLocked(home, options);
        return await flow(home, argument);
      } finally {
        await closeHome(home);
      }
    };

  // MetaMask closes its home page by itself at the end of an onboarding it took up again after an unlock: one already gone is left
  const closeHome = (home: Page) => home.close().catch(() => {});

  /**
   * Unlock a locked wallet with the configured password, and say how it was
   * found. Nothing to do on one already unlocked.
   */
  async function unlockWallet(browser: Browser): Promise<WalletState> {
    const state = await openWallet(browser, { onboard: false });
    if (state === 'onboarding') throw new Error('[dappress] No wallet to unlock: MetaMask is at its onboarding');
    // The side panel, or a popup opened by a request, keeps its unlock form after an unlock made elsewhere
    for (const page of await getRequestPages(browser, await metamaskId(browser))) await metamask.leaveUnlockForm(page, options);
    return state;
  }

  /**
   * Find the confirmation and act on it. A wallet MetaMask locked meanwhile
   * keeps the request behind its unlock form, on the request's page, or on
   * its home when it takes its onboarding as unfinished and opens that in
   * place of the request: the wallet is then unlocked as cy.unlockWallet()
   * does, from its home, through the screens that may follow, and the
   * request is looked for again. One that closes before it is acted on was
   * the popup of the request before, found as it closed: the request's own
   * is looked for once more.
   */
  async function onConfirmation(browser: Browser, act: (page: Page) => Promise<void>): Promise<void> {
    let unlocked = 0;
    let closed = 0;
    for (;;) {
      const extensionId = await metamaskId(browser);
      const page = await getConfirmationPage(browser, extensionId, options.timeout).catch((error: Error) => {
        if (unlocked < 2 && homePageUrls(browser, extensionId).some((url) => metamask.UNLOCK_ROUTE.test(url))) return null;
        throw error;
      });
      if (!page || (unlocked < 2 && (await metamask.showsUnlockForm(page)))) {
        await unlockWallet(browser);
        unlocked++;
        continue;
      }
      try {
        return await act(page);
      } catch (error) {
        if (closed++ > 0 || !(error instanceof metamask.ConfirmationClosed)) throw error;
      }
    }
  }

  /** Approve the prompt a network change raised: "Add network" or the permission to switch. */
  const approveNetworkChange = (browser: Browser) => onConfirmation(browser, (page) => metamask.approveNetworkChange(page, options.timeout));

  /** The task for a decision: find the confirmation, press its button. */
  const decide =
    (decision: metamask.Decision): Action =>
    (browser, argument) =>
      onConfirmation(browser, (page) => metamask.decide(decision, page, options.timeout, argument));

  const actions: Record<string, Action> = {
    setupMetaMask,
    approveNetworkChange,
    addAccount: onHomePage(metamask.addAccount),
    switchAccount: onHomePage(metamask.switchAccount),
    importAccount: onHomePage(metamask.importAccount),
    lockWallet: onHomePage(metamask.lock),
    unlockWallet,
    disconnectFromDapp: onHomePage(metamask.disconnectSite),
  };
  for (const decision of Object.keys(metamask.decisions) as metamask.Decision[]) actions[decision] = decide(decision);

  // cy.task() needs a value back: null when the action has nothing to say
  const asTask = (action: Action) => async (argument: unknown) => (await withBrowser((browser) => action(browser, argument))) ?? null;
  return Object.fromEntries(Object.entries(actions).map(([name, action]) => [`dappress:${name}`, asTask(action)]));
}
