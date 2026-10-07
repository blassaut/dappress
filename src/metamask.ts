// What the plugin drives MetaMask with, by screen: the wallet's own pages
// (metamask-wallet.ts), the confirmation of a request (metamask-confirmation.ts),
// what a transaction's confirmation lets the test set (metamask-transaction.ts),
// all on the selectors of metamask-selectors.ts.

export { decisions, type Decision } from './metamask-selectors';
export {
  walletState,
  onboard,
  unlock,
  UNLOCK_ROUTE,
  showsUnlockForm,
  unlockIfLocked,
  leaveUnlockForm,
  addAccount,
  switchAccount,
  importAccount,
  lock,
  disconnectSite,
} from './metamask-wallet';
export { decide, ConfirmationClosed, approveNetworkChange } from './metamask-confirmation';
