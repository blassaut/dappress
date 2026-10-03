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
      /** Disconnects the dapp from the wallet's permissions screen: the dapp gets an empty accountsChanged. */
      disconnectFromDapp(): Chainable<void>;
      /** Answers a signature request (personal_sign, eth_signTypedData_*). */
      confirmSignature(): Chainable<void>;
      rejectSignature(): Chainable<void>;
      /** Answers a transaction, including ERC-20 approvals. Confirming takes what to set first: a spending cap, a network fee. */
      confirmTransaction(options?: TransactionOptions): Chainable<void>;
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
      /** Adds an account to the wallet and selects it. Yields its name, "Account N". */
      addAccount(): Chainable<string>;
      /** Selects an account of the wallet by its name. */
      switchAccount(name: string): Chainable<void>;
      /** Imports an account from its private key and selects it. Yields its name. */
      importAccount(privateKey: string): Chainable<string>;
      /** Locks the wallet from MetaMask's menu: requests wait behind its unlock screen until it is unlocked. */
      lockWallet(): Chainable<void>;
      /** Unlocks a locked wallet with the configured password. Yields how it was found: "unlocked" when there was nothing to do. */
      unlockWallet(): Chainable<WalletState>;
      /** Moves the dapp onto a network, adding it to MetaMask if needed. Defaults to the wallet setup's network. Yields the chain id. */
      useNetwork(network?: Network): Chainable<string>;
      /** The address the dapp is connected with. */
      getAccountAddress(): Chainable<string>;
    }
  }
}

/** What cy.confirmTransaction() sets on the confirmation before confirming it. */
export interface TransactionOptions {
  /**
   * On an ERC-20 approval, the amount the spender may use, in tokens, as a user types it: 5 or '2.5'.
   * A string keeps an amount a number would round. Fails on a transaction that has no spending cap.
   */
  spendingCap?: number | string;
  /**
   * The network fee: one of the estimates MetaMask's fee editor offers for the network, or custom values.
   * Fails when MetaMask doesn't offer that estimate.
   */
  gas?: GasEstimate | CustomGas;
}

/**
 * An estimate of MetaMask's fee editor, by the name it shows. Low, Market and Aggressive are offered on the
 * networks MetaMask has fee estimates for; Network suggested on those it only has a gas price for, such as a local node.
 */
export type GasEstimate = 'low' | 'market' | 'aggressive' | 'networkSuggested';

/** The fields of the fee editor's advanced form, on an EIP-1559 transaction. One left out keeps MetaMask's value. */
export interface CustomGas {
  /** "Max base fee", in GWEI: the transaction's maxFeePerGas. */
  maxBaseFee?: number | string;
  /** "Priority fee", in GWEI: the transaction's maxPriorityFeePerGas. At most the max base fee. */
  priorityFee?: number | string;
  /** "Gas limit", in units of gas: 21000 or more. */
  gasLimit?: number | string;
}
