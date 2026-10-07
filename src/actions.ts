// The Node side of every cy.* command, registered as Cypress tasks. Each
// action gets a Puppeteer browser connected to the Cypress browser, finds the
// MetaMask page it needs and drives it through the metamask-* modules.

import type { Browser, Page } from 'puppeteer-core';
import { withBrowser } from './browser';
import { timed } from './debug';
import * as metamask from './metamask';
import { findExtensionId, getHomePage, getRequestPages, getConfirmationPage } from './metamask-pages';
import type { ResolvedOptions, WalletState } from './types';

// The argument is what the command gave cy.task(): it is typed there, in support.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Action = (browser: Browser, argument?: any) => Promise<unknown>;

export function createTasks(options: ResolvedOptions): Cypress.Tasks {
  // Found once: the browser is the same for the whole run
  let extensionId: string | undefined;

  async function metamaskId(browser: Browser): Promise<string> {
    extensionId = extensionId || (await findExtensionId(browser, options.timeout));
    return extensionId;
  }

  /** Onboard the wallet or unlock it, so the dapp can talk to it. Safe to call repeatedly. */
  const setupMetaMask = (browser: Browser) => openWallet(browser, { onboard: true });

  async function openWallet(browser: Browser, { onboard }: { onboard: boolean }): Promise<WalletState> {
    const home = await getHomePage(browser, await metamaskId(browser), options.timeout);
    const state = await metamask.walletState(home);
    console.log(`[dappress] MetaMask is ${state}`);
    if (state === 'onboarding' && onboard) await metamask.onboard(home, options);
    if (state === 'locked') await metamask.unlock(home, options);
    if (state === 'unknown') throw new Error(`[dappress] Unexpected MetaMask screen at ${home.url()}`);
    await home.close();
    return state;
  }

  /** A task that drives the wallet's own screens, from its full-screen page. */
  const onHomePage =
    <A, R>(flow: (home: Page, argument: A) => Promise<R>) =>
    async (browser: Browser, argument: A): Promise<R> => {
      const home = await getHomePage(browser, await metamaskId(browser), options.timeout);
      try {
        await home.bringToFront();
        return await flow(home, argument);
      } finally {
        await home.close();
      }
    };

  /**
   * Unlock a locked wallet with the configured password, and say how it was
   * found. Nothing to do on one already unlocked.
   */
  async function unlockWallet(browser: Browser): Promise<WalletState> {
    const state = await openWallet(browser, { onboard: false });
    if (state === 'onboarding') throw new Error('[dappress] No wallet to unlock: MetaMask is at its onboarding');
    // The side panel, or a popup opened by a request, keeps its unlock form after an unlock made elsewhere
    for (const page of await getRequestPages(browser, await metamaskId(browser), options.timeout)) await metamask.leaveUnlockForm(page, options);
    return state;
  }

  /**
   * Find the confirmation and act on it. One that closes before it is acted
   * on was the popup of the request before, found as it closed: the request's
   * own is looked for once more.
   */
  async function onConfirmation(browser: Browser, act: (page: Page) => Promise<void>): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const page = await getConfirmationPage(browser, await metamaskId(browser), options.timeout);
      try {
        return await act(page);
      } catch (error) {
        if (attempt > 0 || !(error instanceof metamask.ConfirmationClosed)) throw error;
      }
    }
  }

  /** Approve the prompt a network change raised: "Add network" or the permission to switch. */
  const approveNetworkChange = (browser: Browser) => onConfirmation(browser, (page) => metamask.approveNetworkChange(page));

  /** The task for a decision: find the confirmation, press its button. */
  const decide =
    (decision: metamask.Decision): Action =>
    (browser, argument) =>
      onConfirmation(browser, (page) => metamask.decide(decision, page, argument));

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
  const asTask = (name: string, action: Action) => async (argument: unknown) =>
    (await timed(`task ${name}`, () => withBrowser((browser) => action(browser, argument)))) ?? null;
  return Object.fromEntries(Object.entries(actions).map(([name, action]) => [`dappress:${name}`, asTask(name, action)]));
}
