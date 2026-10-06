# Dappress

**Test your dapp against the wallets your users run, starting with MetaMask.**

[![MetaMask conformance](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/blassaut/dappress/conformance-reports/badge.json)](https://github.com/blassaut/dappress/blob/conformance-reports/MATRIX.md)
[![Reproducible build](https://github.com/blassaut/dappress/actions/workflows/reproducible.yml/badge.svg)](https://github.com/blassaut/dappress/actions/workflows/reproducible.yml)

Dappress is a Cypress plugin for the end-to-end tests of a dapp. It gives your tests a wallet to talk to, in two ways, with the same `cy.*` commands:

- **The real MetaMask**, loaded into the browser Cypress launches. Your test clicks "Send" in the dapp, then calls `cy.confirmTransaction()`; Dappress presses the button on MetaMask's screen.
- **A mock of MetaMask, Rabby or Phantom**, that answers your dapp as the real wallet was recorded answering. No extension, a few seconds per run, and a way to find what breaks on the wallets your users have besides MetaMask.

## What you get

- **Plain Cypress commands.** `cy.connectToDapp()`, `cy.confirmSignature()`, `cy.confirmTransaction()`, typed for TypeScript. Nothing new to learn, and the same specs for the real wallet and the mocks.
- **The MetaMask your users run.** The latest release by default, any other on request. Every command is checked against each new MetaMask release the day it comes out, on the [conformance matrix](https://github.com/blassaut/dappress/blob/conformance-reports/MATRIX.md): when MetaMask moves a screen, Dappress adapts, not your tests.
- **The other wallets too.** Rabby and Phantom both claim to be MetaMask, and do not answer as it does: Rabby refuses a switch to an unknown chain with `-32603` where MetaMask says `4902`, Phantom has no `wallet_revokePermissions`. Run your specs against their [mocks](#mock-wallets) and see what fails before your users do.
- **Any chain, at any block.** A mock sends to the chain your dapp uses, or to a fork of it pinned to a block, where a test can move a price or the clock: a liquidation, an expiry, the same state on every run.
- **Errors that name the cause.** A command that cannot go on says which MetaMask screen it was on, quotes it, and points to a screenshot; a mock says what the wallet answered, "as recorded".

## Cypress, and only Cypress

A wallet driver is screen-by-screen code: selectors, retries for the clicks a screen loses while it settles, the waits between a button and the next screen. That code cannot be shared across test frameworks without serving each one worse, so Dappress serves one, natively: the commands run in the browser Cypress launches, through Cypress's own plugin and task APIs, with nothing else in the process.

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Configuration](#configuration)
- [Mock wallets](#mock-wallets)
- [Wallet profiles](#wallet-profiles)
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

### 2. Get a browser that loads extensions

```sh
npx @puppeteer/browsers install chrome@stable
```

The command downloads Chrome for Testing and prints the path of its executable. Google Chrome itself no longer loads extensions. `npx cypress info` lists the browsers Cypress finds by itself.

### 3. Register the plugin

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

### 4. Load the commands

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

### 5. Choose the network

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

### How it works

Dappress connects Puppeteer to the browser Cypress launched, through the debugging URL Cypress provides, and presses MetaMask's own buttons by their test ids. Nothing is injected into MetaMask, nothing is mocked: what your test drives is the extension your users have.

### Testing with funds

By default, Dappress creates a new, empty wallet for each run. That is enough to connect and sign. To send transactions, use a wallet of yours that holds test funds, and keep its seed phrase outside the repository.

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

### Running in CI

The job needs Chrome for Testing, and a display for the headed run on Linux. On GitHub Actions:

```yaml
jobs:
  metamask:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - id: chrome
        run: echo "path=$(npx @puppeteer/browsers install chrome@stable --format '{{path}}' | tail -n 1)" >> "$GITHUB_OUTPUT"
      - run: npx cypress run --browser "${{ steps.chrome.outputs.path }}" --headed
        env:
          DAPPRESS_SEED_PHRASE: ${{ secrets.DAPPRESS_SEED_PHRASE }}
```

Cypress starts Xvfb itself for the headed run. Drop `--headed` to run headless; MetaMask then shows its requests in the side panel, and the wallet cache is not used.

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
| `metamaskChecksum` | `DAPPRESS_METAMASK_CHECKSUM` | The SHA-256 Dappress accepts the archive with. Known for the versions `src/config.ts` lists; set it for another version, which is otherwise loaded as downloaded, with a warning. |
| `timeout`         |                             | `20000` ms. How long a command waits for MetaMask to show the request.                                                                                                       |
| `autoSetup`       |                             | `true`. Set to `false` to call `cy.setupMetaMask()` yourself.                                                                                                                |
| `cache`           |                             | `false`. Importing the wallet takes about fifteen seconds per run. With `true`, Dappress imports it once and reuses the browser profile. Needs your own seed phrase and a headed run. |
| `backupAndSync`   |                             | `false`. Dappress turns off MetaMask's backup and sync, so accounts added by a test do not come back on the next run.                                                        |
| `cacheDir`        |                             | `~/.cache/dappress`. Where MetaMask builds and the wallet cache are kept.                                                                                                     |
| `mock`            | `DAPPRESS_MOCK`             | None. A wallet to mock in place of MetaMask, `metamask`, `rabby`, `phantom`, or the path of a profile: see [Mock wallets](#mock-wallets).                                        |
| `rpcUrl`          | `DAPPRESS_RPC_URL`          | `http://127.0.0.1:8545`. Where the mock's keys are: Anvil, whose unlocked accounts sign. Also the chain of a chain the mock has no RPC for.                                     |
| `chains`          |                             | None. The RPC of each chain, by chain id, for the mock: `{ '0xa4b1': 'http://127.0.0.1:8545' }`. A chain the dapp adds brings its own.                                           |

## Mock wallets

**What it brings.** Your users do not all run MetaMask, and a dapp that works with MetaMask can break on Rabby or Phantom: an error code it does not expect, a method the wallet does not have, a chain switch the wallet refuses without asking. Testing each wallet by hand does not scale, and driving each wallet's screens is a project of its own. A mock answers your dapp as the real wallet was recorded answering, so the specs you wrote for MetaMask run against Rabby and Phantom as they are, in seconds, in CI.

### In three steps

1. Start [Anvil](https://getfoundry.sh), the local node whose accounts the mock signs with:

   ```sh
   anvil
   ```

2. Run your specs against a wallet's mock, with nothing to change in them:

   ```sh
   DAPPRESS_MOCK=rabby npx cypress run --browser chrome-for-testing
   ```

   or, in `cypress.config.ts`, `configureDappress(on, config, { mock: 'rabby' })`. The wallets: `metamask`, `rabby`, `phantom`, or the path of a [profile](#wallet-profiles) you recorded.

3. Read what failed. A test that passes with MetaMask and fails with Rabby is a difference between the two wallets, and the command log says which: "Rabby 0.94.11 answers -32603 "Unrecognized chain ID …" to wallet_switchEthereumChain, as recorded". Fix the dapp, or write the test for what that wallet does.

### In CI

One job per wallet, side by side:

```yaml
jobs:
  wallets:
    runs-on: ubuntu-24.04
    strategy:
      fail-fast: false
      matrix:
        wallet: [metamask, rabby, phantom]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: foundry-rs/foundry-toolchain@v1
      - run: npm ci
      - run: npx @puppeteer/browsers install chrome@stable
      - run: anvil &
      - run: npx cypress run --browser chrome-for-testing
        env:
          DAPPRESS_MOCK: ${{ matrix.wallet }}
```

No extension and no seed phrase are needed to connect and sign. To send transactions on a testnet, start Anvil with the seed phrase of a funded test wallet, `anvil --mnemonic "$DAPPRESS_SEED_PHRASE"`: see the next section.

### Your chain, at your block

Anvil holds the keys; each chain holds its state. On a chain your dapp adds with `wallet_addEthereumChain`, the mock reads from the RPC the dapp gives, and sends a transaction there once Anvil signed it, nonce, gas and fees taken from that chain. With the seed phrase of a funded test wallet in Anvil, your tests send real transactions on your testnet, as with MetaMask.

To freeze the state, fork the chain at a block and send the mock there:

```sh
anvil --fork-url "$ARBITRUM_RPC" --fork-block-number 245000000
```

```ts
configureDappress(on, config, { mock: 'rabby', chains: { '0xa4b1': 'http://127.0.0.1:8545' } });
```

Every run starts from the same positions, balances and prices. The test changes what it needs through Anvil's own methods, then goes through the dapp as a user would:

```ts
it('liquidates a position under water', () => {
  cy.visit('/trade/ETH-PERP');
  cy.contains('button', 'Connect').click();
  cy.connectToDapp();
  // The oracle's price falls: written into the fork, then a block is mined
  cy.request('POST', 'http://127.0.0.1:8545', { jsonrpc: '2.0', id: 1, method: 'anvil_setStorageAt', params: [oracle, slot, lowPrice] });
  cy.request('POST', 'http://127.0.0.1:8545', { jsonrpc: '2.0', id: 2, method: 'evm_mine', params: [] });
  cy.contains('button', 'Liquidate').click();
  cy.confirmTransaction();
  cy.contains('Position closed').should('be.visible');
});
```

What the dapp reads through its own RPC, rather than through the wallet, still goes where the dapp sends it, and an API or an indexer it calls is not forked: point them at the fork with `cy.intercept`, or with the dapp's own settings.

### How the mock answers

| What | Where it comes from |
| --- | --- |
| Identity flags (`isMetaMask`, `isRabby`…), the EIP-6963 announcement | The wallet's profile |
| A rejection: its code, message and data | The wallet's profile |
| A method the wallet lacks, a chain switch it refuses, a constant answer | The wallet's profile |
| Balances, blocks, calls, gas, nonces | The chain the dapp is on: its RPC, a fork, or Anvil |
| Signatures, and the signature of a transaction | Anvil, with its accounts |

A method or an option the profile does not cover fails with `4200` and the wallet's name: the mock never succeeds at what the wallet was not seen doing. It decides only what a user decides: a request waits for `cy.confirmTransaction()` or `cy.rejectTransaction()`, as on the real wallet.

What it does not do: `cy.importAccount()` lets Anvil act for the key's address but not sign for it, so that account sends on Anvil's chain or a fork only; `cy.confirmTransaction({ gas })` takes `'networkSuggested'` or custom values, the mock having no fee estimates.

## Wallet profiles

A profile is what a dapp sees of a wallet, recorded on the real wallet, request by request and event by event: what each method answers, the code and message of each rejection, the events and their payloads. It is what a mock replays. Profiles of MetaMask (written by the conformance suite at each release), Rabby and Phantom (recorded by hand) ship with Dappress, in [`reports/profiles`](reports/profiles).

`npm run profile -- diff <a> <b>` lists where two wallets answer differently. A wallet that is not there yet takes twenty minutes and a browser console to record: see [CONTRIBUTING.md](CONTRIBUTING.md#wallet-profiles).

## Security

Dappress reads a seed phrase and drives a wallet. What it does with them, in short; [SECURITY.md](https://github.com/blassaut/dappress/blob/main/SECURITY.md) has the details, a way to check each point, and how to report a flaw.

- **Secrets stay in Node.js.** The seed phrase and the password are typed into MetaMask's own screens and go nowhere else: not the browser side, not the logs. Without a seed phrase, one is generated on your machine.
- **One download, checked.** The MetaMask build, from MetaMask's GitHub releases, once per version, against the SHA-256 Dappress knows for it. No other host, no telemetry. A mock wallet talks to the RPC endpoint you name, and nothing else.
- **No request of its own to the wallet** beyond `eth_accounts`, `eth_chainId` and `wallet_addEthereumChain`. A signature or a transaction only comes from your dapp.
- **A package you can check.** Four dependencies, no install script, published by GitHub Actions as a trusted publisher with a provenance attestation, and built again from its tag after every release: the "Reproducible build" badge above.
- **Use a test wallet.** A seed phrase made for testing, funded on test networks only, and not a well-known one such as Hardhat's or Anvil's: MetaMask restores the accounts other people saved for it. With `cache: true`, treat `~/.cache/dappress/profiles` like the seed phrase.

## Troubleshooting

- **Cypress exits immediately with `MODULE_NOT_FOUND`.** Your terminal sets `ELECTRON_RUN_AS_NODE=1`, as some IDEs do. Run `env -u ELECTRON_RUN_AS_NODE npx cypress run …`.
- **"MetaMask showed no confirmation".** The dapp sent no request, or the network's RPC endpoint is unreachable.
- **Adding or importing an account never finishes.** `chromeWebSecurity: false` is set in your Cypress config. MetaMask then cannot start the snaps its account screens wait for. Remove that setting.
- **The wallet shows accounts you did not create.** The seed phrase is used elsewhere, and MetaMask restored what it saved for it. Use a phrase made for your tests, or none.
- **"MetaMask extension not found in the browser".** The browser did not load the extension. Most often it is Google Chrome 137 or later, which no longer loads extensions. Use Chrome for Testing: see [step 2](#2-get-a-browser-that-loads-extensions).

## Contributing

How Dappress works, how to run the conformance suite, update to a new MetaMask release and publish a version: see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
