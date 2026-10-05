# Dappress

**MetaMask automation for Cypress.**

[![MetaMask conformance](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/blassaut/dappress/conformance-reports/badge.json)](https://github.com/blassaut/dappress/blob/conformance-reports/MATRIX.md)

Your dapp asks MetaMask to connect, sign or send a transaction, and a real user clicks a button in the wallet. Dappress clicks it for you. It loads the real MetaMask extension into the browser Cypress launches, imports a test wallet, and gives you `cy.*` commands such as `cy.connectToDapp()` or `cy.confirmTransaction()`.

- **The latest MetaMask.** You choose the extension version. Every MetaMask release is tested daily, one test per command: see the [conformance matrix](https://github.com/blassaut/dappress/blob/conformance-reports/MATRIX.md).
- **Plain Cypress.** No second browser, no proxy. Commands are typed for TypeScript.
- **Stable selectors.** They come from MetaMask's own end-to-end tests, each with a fallback.

## Why Dappress exists

A dapp's end-to-end tests have to drive MetaMask: connect, sign, confirm. MetaMask is a browser extension, out of reach of Cypress on its own, and its screens change from one release to the next. A tool pinned to one MetaMask version tests a wallet your users no longer have, and a tool nobody keeps up with MetaMask stops working.

Of the tools that did this, [dAppeteer](https://github.com/ChainSafe/dappeteer) was deprecated in April 2024, and [Synpress](https://github.com/Synthetixio/synpress) ships with one MetaMask version built in: 13.13.1 in Synpress 4.1.2, where MetaMask is at 13.50.0.

Dappress makes three choices instead:

- **Your MetaMask version**, with the latest release as the default. A workflow runs every command against each new MetaMask release the day it comes out, and the result goes on the [conformance matrix](https://github.com/blassaut/dappress/blob/conformance-reports/MATRIX.md): a MetaMask change shows up there before it shows up in your pipeline.
- **Cypress only.** The extension is loaded into the browser Cypress launches, and the commands are `cy.*` commands. Puppeteer connects to that same browser to click in MetaMask's pages; there is no second browser and no proxy.
- **MetaMask's own selectors**, from the page objects of its end-to-end tests, each with a fallback. That is what keeps up with the UI.

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Configuration](#configuration)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Requirements

| Dependency | Version                                                                       |
| ---------- | ----------------------------------------------------------------------------- |
| Cypress    | 15.10 or later                                                                |
| Node.js    | 20 or later                                                                   |
| Browser    | Chrome for Testing, Chromium or Electron. Not Google Chrome: since version 137 it no longer loads extensions. |

Tested on macOS and on GitHub's Linux runners.

## Quick start

### 1. Install

```sh
npm install --save-dev dappress
```

### 2. Register the plugin

```ts
// cypress.config.ts
import { defineConfig } from 'cypress';
import { configureDappress } from 'dappress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    testIsolation: false,
    setupNodeEvents(on, config) {
      return configureDappress(on, config);
    },
  },
});
```

`testIsolation: false` is required. The tests of a spec share one wallet, and Cypress must not reset the page between them. Each test starts where the previous one ended, so write the tests of a spec to run in order.

### 3. Load the commands

```ts
// cypress/support/e2e.ts
import 'dappress/support';
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "types": ["cypress", "dappress/support"]
  }
}
```

JavaScript projects use the same files with a `.js` extension and `module.exports`, and skip `tsconfig.json`.

### 4. Choose the network

Dappress reads `cypress/wallet.setup.ts` (or `.js`) by itself. It holds no secret, so commit it.

```ts
// cypress/wallet.setup.ts
import type { WalletSetup } from 'dappress';

const wallet: WalletSetup = {
  // The network cy.connectToDapp() moves the dapp onto
  network: {
    chainId: '0x88bb0',
    chainName: 'Hoodi',
    rpcUrls: ['https://ethereum-hoodi-rpc.publicnode.com'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
};

export default wallet;
```

This step is optional. Without a network, the dapp stays on Ethereum mainnet, where MetaMask starts.

### 5. Get a browser that loads extensions

```sh
npx @puppeteer/browsers install chrome@stable
```

The command downloads Chrome for Testing and prints the path of its executable. `npx cypress info` lists the browsers Cypress finds by itself.

### 6. Write a test and run it

```ts
// cypress/e2e/wallet.cy.ts
it('connects the wallet and signs in', () => {
  cy.visit('/');
  cy.contains('button', 'Connect wallet').click();
  cy.connectToDapp();
  cy.getAccountAddress().should('match', /^0x[0-9a-f]{40}$/);

  cy.contains('button', 'Sign in').click();
  cy.confirmSignature();
});
```

```sh
npx cypress run --browser /path/to/chrome-for-testing
```

Pass `--browser chrome-for-testing` instead when `npx cypress info` lists it. Add `--headed` to watch MetaMask at work.

Before the first test of each spec, Dappress imports the wallet. Each command then waits for MetaMask to show the request, answers it, and waits for the request to close.

### Testing with funds

By default, Dappress creates a new, empty wallet for each run. That is enough to connect and sign. To send transactions, use a wallet of yours that holds test funds, and give its seed phrase outside the repository.

On your machine, in `cypress.env.json` (add it to `.gitignore`):

```json
{
  "DAPPRESS_SEED_PHRASE": "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
}
```

In CI, as an encrypted secret:

```yaml
# GitHub Actions
env:
  DAPPRESS_SEED_PHRASE: ${{ secrets.DAPPRESS_SEED_PHRASE }}
```

Read [Security](#security) before you pick that seed phrase.

## Commands

### Connection

| Command                          | What it does                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `cy.connectToDapp()`             | Accepts the connection request, then switches the dapp to the network of your wallet setup. |
| `cy.connectToDapp({ accounts })` | Same, but connects only the listed accounts, for example `['Account 1', 'Account 2']`.       |
| `cy.rejectConnection()`          | Rejects the connection request.                                                              |
| `cy.disconnectFromDapp()`        | Disconnects the dapp in MetaMask. The dapp receives an empty `accountsChanged`.              |
| `cy.getAccountAddress()`         | Yields the address the dapp is connected with.                                               |

### Signatures and transactions

| Command                           | What it does                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `cy.confirmSignature()`           | Signs the message (`personal_sign`, `eth_signTypedData_*`).                                                            |
| `cy.rejectSignature()`            | Rejects the signature request.                                                                                         |
| `cy.confirmTransaction(options?)` | Confirms the transaction, ERC-20 approvals included. Options set the spending cap or the gas fee first: see below. |
| `cy.rejectTransaction()`          | Rejects the transaction.                                                                                               |

### Networks and tokens

| Command                     | What it does                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `cy.useNetwork(network?)`   | Switches the dapp to a network, and adds it to MetaMask if needed. Defaults to your wallet setup. |
| `cy.approveNewNetwork()`    | Accepts a `wallet_addEthereumChain` request.                                                       |
| `cy.rejectNewNetwork()`     | Rejects it.                                                                                        |
| `cy.approveSwitchNetwork()` | Accepts a `wallet_switchEthereumChain` request to a network the dapp has no permission on yet.     |
| `cy.rejectSwitchNetwork()`  | Rejects it.                                                                                        |
| `cy.approveAddToken()`      | Accepts a `wallet_watchAsset` request.                                                             |
| `cy.rejectAddToken()`       | Rejects it.                                                                                        |

### Accounts and wallet

| Command                        | What it does                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `cy.addAccount()`              | Creates an account and selects it. Yields its name, for example `Account 2`.                           |
| `cy.importAccount(privateKey)` | Imports an account from a private key and selects it. Yields its name. The key stays out of the log.   |
| `cy.switchAccount(name)`       | Selects an account by its name.                                                                        |
| `cy.lockWallet()`              | Locks the wallet. Requests then wait until it is unlocked.                                             |
| `cy.unlockWallet()`            | Unlocks the wallet. Yields `locked` if it was locked, `unlocked` if there was nothing to do.           |
| `cy.setupMetaMask()`           | Imports or unlocks the wallet. Runs by itself before each spec, unless `autoSetup` is `false`.         |

### Transaction options

```ts
// ERC-20 approval: allow the spender 2.5 tokens, whatever the dapp asked for
cy.confirmTransaction({ spendingCap: '2.5' });

// One of the fee levels MetaMask offers
cy.confirmTransaction({ gas: 'aggressive' });

// Custom fees, in GWEI, as in MetaMask's advanced fee form
cy.confirmTransaction({ gas: { maxBaseFee: 30, priorityFee: 2, gasLimit: 100000 } });
```

| Option        | Value                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spendingCap` | The amount the spender may use, in tokens: `5` or `'2.5'`. Use a string to avoid rounding. Fails if the transaction is not an ERC-20 approval.                                            |
| `gas`         | A fee level: `'low'`, `'market'` or `'aggressive'`. On a network with no fee estimates, such as a local node, use `'networkSuggested'`. Fails if MetaMask does not offer that level.      |
| `gas`         | Or custom values: `maxBaseFee` and `priorityFee` in GWEI, and `gasLimit`. A missing field keeps MetaMask's value. EIP-1559 transactions only.                                              |

Both options can be combined. MetaMask remembers the fee chosen for an account on a network and starts the next transaction from it.

## Configuration

Settings come from three places:

- **`cypress/wallet.setup.ts`** for the network. It accepts `network` and `seedPhrase` only, and any other key is an error. Keep the seed phrase out of it, since this file is committed.
- **Environment variables or `cypress.env.json`** for secrets and the MetaMask version.
- **The third argument of `configureDappress()`** for everything else:

```ts
setupNodeEvents(on, config) {
  return configureDappress(on, config, { cache: true, timeout: 30000 });
}
```

When a setting appears in several places, the first one found wins: environment variable, then `cypress.env.json`, then `wallet.setup.ts`, then `configureDappress()`.

| Option            | Environment variable        | Default and meaning                                                                                                                                                         |
| ----------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `network`         |                             | None. The network `cy.connectToDapp()` and `cy.useNetwork()` switch to.                                                                                                     |
| `seedPhrase`      | `DAPPRESS_SEED_PHRASE`      | None. A new wallet is created for each run. It is never written to disk.                                                                                                    |
| `password`        | `DAPPRESS_PASSWORD`         | `Tester@1234`. It only protects the throwaway browser profile of the run.                                                                                                   |
| `metamaskVersion` | `DAPPRESS_METAMASK_VERSION` | `13.50.0`. Downloaded from MetaMask's GitHub releases on first use, then cached.                                                                                             |
| `timeout`         |                             | `20000` ms. How long a command waits for MetaMask to show the request.                                                                                                       |
| `autoSetup`       |                             | `true`. Set to `false` to call `cy.setupMetaMask()` yourself.                                                                                                                |
| `cache`           |                             | `false`. Importing the wallet takes about fifteen seconds per run. With `true`, Dappress imports it once and reuses the browser profile. Needs your own seed phrase and a headed run. |
| `backupAndSync`   |                             | `false`. Dappress turns off MetaMask's backup and sync, so accounts added by a test do not come back on the next run.                                                        |
| `cacheDir`        |                             | `~/.cache/dappress`. Where MetaMask builds and cached profiles are kept.                                                                                                     |

## Security

- **Use a seed phrase made for testing**, funded on test networks only.
- **Avoid well-known phrases**, such as the Hardhat or Anvil development mnemonic. MetaMask restores the accounts other people saved for them, and your wallet will not be the one you expect.
- **Secrets stay in Node.js.** The seed phrase and the password never reach the browser or the Cypress log.
- **With `cache: true`**, `~/.cache/dappress/profiles` holds the wallet's encrypted vault. Treat it like the seed phrase: keep it on the machine, and keep it out of any CI cache that other people or workflows can restore.

## Troubleshooting

- **Cypress exits immediately with `MODULE_NOT_FOUND`.** Your terminal sets `ELECTRON_RUN_AS_NODE=1`, as some IDEs do. Run `env -u ELECTRON_RUN_AS_NODE npx cypress run …`.
- **"MetaMask showed no confirmation".** The dapp sent no request, or the network's RPC endpoint is unreachable.
- **Adding or importing an account never finishes.** `chromeWebSecurity: false` is set in your Cypress config. MetaMask then cannot start the snaps its account screens wait for. Remove that setting.
- **The wallet shows accounts you did not create.** The seed phrase is used elsewhere, and MetaMask restored what it saved for it. Use a phrase made for your tests, or none.
- **"MetaMask extension not found in the browser".** The browser did not load the extension. Most often it is Google Chrome 137 or later, which no longer can. Use Chrome for Testing: see [step 5](#5-get-a-browser-that-loads-extensions).

## Contributing

How Dappress works, how to run the conformance suite, update to a new MetaMask release and publish a version: see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
