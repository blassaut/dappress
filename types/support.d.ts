/// <reference types="cypress" />

import type { Network } from './index';

export type WalletState = 'onboarding' | 'locked' | 'unlocked';

declare global {
  namespace Cypress {
    interface Chainable {
      /** Imports or unlocks the wallet. Runs by itself before each spec unless autoSetup is false. */
      setupMetaMask(): Chainable<WalletState>;
      /** Accepts the connection request, then moves the dapp onto the wallet setup's network if there is one. */
      connectToDapp(): Chainable<void>;
      rejectConnection(): Chainable<void>;
      /** Answers a signature request (personal_sign, eth_signTypedData_*). */
      confirmSignature(): Chainable<void>;
      rejectSignature(): Chainable<void>;
      /** Answers a transaction, including ERC-20 approvals. */
      confirmTransaction(): Chainable<void>;
      rejectTransaction(): Chainable<void>;
      /** Answers wallet_addEthereumChain. */
      approveNewNetwork(): Chainable<void>;
      rejectNewNetwork(): Chainable<void>;
      /** Answers the permission asked before switching to a network the dapp isn't allowed on yet. */
      approveSwitchNetwork(): Chainable<void>;
      rejectSwitchNetwork(): Chainable<void>;
      /** Answers wallet_watchAsset ("Add suggested tokens"). */
      approveAddToken(): Chainable<void>;
      rejectAddToken(): Chainable<void>;
      /** Moves the dapp onto a network, adding it to MetaMask if needed. Defaults to the wallet setup's network. Yields the chain id. */
      useNetwork(network?: Network): Chainable<string>;
      /** The address the dapp is connected with. */
      getAccountAddress(): Chainable<string>;
    }
  }
}
