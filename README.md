# Dappress

**Test your dapp against the wallets your users run, starting with MetaMask.**

[![MetaMask conformance](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/blassaut/dappress/conformance-reports/badge.json)](https://github.com/blassaut/dappress/blob/conformance-reports/MATRIX.md)
[![Reproducible build](https://github.com/blassaut/dappress/actions/workflows/reproducible.yml/badge.svg)](https://github.com/blassaut/dappress/actions/workflows/reproducible.yml)

Dappress is a Cypress plugin for the end-to-end tests of a dapp. Your test clicks "Connect" or "Send" in the dapp, then answers the wallet with a Cypress command: `cy.connectToDapp()`, `cy.confirmSignature()`, `cy.confirmTransaction()`.

The wallet that answers is one of two, and the same specs run on both:

- **The real MetaMask**, the extension your users install, loaded into the browser Cypress launches. Dappress presses the buttons on its screens.
- **A mock of MetaMask, Rabby or Phantom**, a wallet in the page that answers your dapp as the real one was recorded answering. No extension, no screens, about a second per test.

## Real MetaMask or a mock?

|                       | Real MetaMask                                                         | Mock                                                                                       |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| What your test drives | The MetaMask extension, its screens and its buttons                   | A wallet in the page, that answers as MetaMask, Rabby or Phantom does                      |
| What it proves        | The flow works with the wallet your users install, screens included   | Your dapp handles what each wallet answers: its error codes, the methods it lacks, the chain switches it refuses |
| What you need         | Chrome for Testing, and a funded seed phrase to send transactions     | [Anvil](https://getfoundry.sh), the local node whose accounts sign                         |
| Time                  | About fifteen seconds to set the wallet up, then a few seconds per request | About a second per test                                                               |
| Transactions go to    | The network your wallet setup names                                   | The chain the dapp is on: your testnet, a fork of it pinned to a block, or Anvil           |
| Use it                | Before a release, or nightly: the real flow, end to end               | On every commit: Rabby and Phantom too, and the same chain state on every run              |

Most projects run both: the mocks on every pull request, the real MetaMask nightly. You switch with one environment variable, `DAPPRESS_MOCK`, and change nothing in the specs.

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [With the real MetaMask](#with-the-real-metamask)
- [With a mock](#with-a-mock)
- [Commands](#commands)
- [Configuration](#configuration)
- [Wallet profiles](#wallet-profiles)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Requirements

| Dependency | Version                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Cypress    | 15.10 or later                                                                                              |
| Node.js    | 22.12 or later                                                                                              |
| Browser    | Chrome for Testing, Chromium or Electron. Not Google Chrome: since version 137 it no longer loads extensions. |
| Anvil      | For the mocks only. Part of [Foundry](https://getfoundry.sh).                                               |

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

### 4. Choose the network (optional)

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

Without a network, the dapp stays where the wallet starts, on Ethereum mainnet, or on the chain it adds itself.

### 5. Write a test

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

Where the dapp asks the user to pick a wallet (Privy, RainbowKit, Web3Modal…), pick it by the name `cy.getWallet()` yields rather than by "MetaMask", so that the spec runs on every wallet:

```ts
cy.getWallet().then(({ name }) => cy.contains('button', name).click());
```

### 6. Run it

On the real MetaMask, in Chrome for Testing:

```sh
npx @puppeteer/browsers install chrome@stable
npx cypress run --browser chrome-for-testing --headed
```

On the mock of Rabby, with Anvil running in another terminal:

```sh
anvil
DAPPRESS_MOCK=rabby npx cypress run --browser chrome-for-testing
```

The next two sections say what each one needs, what it does, and how to run it in CI.

## With the real MetaMask

Dappress downloads MetaMask (13.50.0 by default, any other on request), loads it into the browser Cypress launches, and imports a wallet before the first test of each spec. Each command then waits for MetaMask to show the request, presses its button, and waits for the request to close.

Nothing is injected into MetaMask and nothing is mocked: Dappress connects Puppeteer to the browser Cypress launched, and presses MetaMask's own buttons by their test ids. Every command is checked against each new MetaMask release the day it comes out, on the [conformance matrix](https://github.com/blassaut/dappress/blob/conformance-reports/MATRIX.md): when MetaMask moves a screen, Dappress adapts, not your tests.

### The browser

Google Chrome no longer loads extensions, so the run needs Chrome for Testing:

```sh
npx @puppeteer/browsers install chrome@stable
```

The command prints the path of its executable. Pass `--browser chrome-for-testing` when `npx cypress info` lists it, the path otherwise. `--headed` shows MetaMask at work, and lets Dappress reuse the wallet between runs (the `cache` option).

### The wallet and its funds

By default, Dappress creates a new, empty wallet for each run. That is enough to connect and sign. To send transactions, use a wallet of yours that holds test funds, and keep its seed phrase outside the repository.

On your machine, in `cypress.env.json` (add it to `.gitignore`):

```json
{
  "DAPPRESS_SEED_PHRASE": "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
}
```

Read [Security](#security) before you pick that seed phrase.

### In CI

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

## With a mock

Your users do not all run MetaMask, and a dapp that works with MetaMask can break on Rabby or Phantom. Both claim to be MetaMask, and neither answers as it does: Rabby refuses a switch to an unknown chain with `-32603` where MetaMask says `4902`, and Phantom has no `wallet_revokePermissions`. Testing each wallet by hand does not scale.

A mock is a wallet in the page, in place of the extension. It answers your dapp as the real wallet was recorded answering, from that wallet's [profile](#wallet-profiles), and lets [Anvil](https://getfoundry.sh) hold the keys and sign. Your specs run on it as they are.

### Run it

1. Start Anvil:

   ```sh
   anvil
   ```

2. Run your specs on a wallet's mock: `metamask`, `rabby` or `phantom`.

   ```sh
   DAPPRESS_MOCK=rabby npx cypress run --browser chrome-for-testing
   ```

   Or set it in the config: `configureDappress(on, config, { mock: 'rabby' })`.

3. Read what failed. A test that passes with MetaMask and fails with Rabby is a difference between the two wallets, and the command log says which: "Rabby 0.94.11 answers -32603 "Unrecognized chain ID …" to wallet_switchEthereumChain, as recorded". Fix the dapp, or write the test for what that wallet does.

### What a mock does

- **Every command.** Connect, sign, send, add and switch chains, add tokens, add and switch accounts, lock and unlock: the commands are the same as on the real MetaMask, and so are the specs.
- **What each wallet answers.** Its identity flags and EIP-6963 announcement, the code and message of each rejection, the methods it lacks, the chain switches it refuses without asking. A method or an option the profile does not cover fails with `4200`: the mock never succeeds at what the wallet was not seen doing.
- **The permissions and capabilities the dapp asks for**, as the wallet answered them, with the mock's own accounts, chains and origin in them: `wallet_getPermissions`, `wallet_requestPermissions`, which asks the user even while connected, as MetaMask does, and `wallet_getCapabilities`.
- **What the user decides, and only that.** A request waits for your command, `cy.confirmTransaction()` or `cy.rejectTransaction()`, as it would on the real wallet.
- **Real transactions.** Anvil signs, and the mock sends the transaction to the chain the dapp is on: Anvil's own, your testnet, or a fork. See [Your chain, at your block](#your-chain-at-your-block).

### What it does not do

- **Reach a wallet the dapp does not find in the page.** A mock is an injected wallet, found through `window.ethereum` or EIP-6963. WalletConnect, a wallet SDK such as Coinbase's, and an embedded wallet such as Privy's are out of its reach.
- **Answer what its profile did not record.** A wallet method the profile has not seen fails with `4200` and says so, even where the real wallet supports it: MetaMask's profile is the only one with EIP-5792's `wallet_getCapabilities`, and it records `wallet_sendCalls` only as MetaMask's refusal on a chain it does not batch on, `5710`: a batch MetaMask would send is not recorded yet. The `eth_*` reads go to the chain, recorded or not.
- **Show screens.** A mock tests your dapp, not the wallet's interface: how MetaMask displays your request needs the real MetaMask.
- **Estimate fees.** `cy.confirmTransaction({ gas })` takes `'networkSuggested'` or custom values, not `'low'`, `'market'` or `'aggressive'`.
- **Sign for an imported key on a testnet.** `cy.importAccount()` lets Anvil act for the key's address, not sign for it: that account sends on Anvil's chain or a fork only.
- **Answer for your dapp's backend.** What the dapp reads through its own RPC, its API or an indexer, rather than through the wallet, still goes where the dapp sends it. Point them at the fork with `cy.intercept`, or with the dapp's own settings.

### In CI

One job per wallet, side by side. No extension and no seed phrase:

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

### Your chain, at your block

Anvil holds the keys; each chain holds its state. When your dapp adds its chain with `wallet_addEthereumChain`, as most do on connection, the mock reads from the RPC the dapp gives, and sends a transaction there once Anvil signed it, nonce, gas and fees taken from that chain.

**On your testnet.** Start Anvil with the seed phrase of a test wallet funded there, and your tests send real transactions, as with MetaMask:

```sh
anvil --mnemonic "$DAPPRESS_SEED_PHRASE"
```

**At a block.** Run Anvil as a fork of the chain, pinned to a block. A fork keeps the chain's id, and the mock sends the dapp's requests for that chain to it. Every run starts from the same positions, balances and prices:

```sh
anvil --fork-url "$ARBITRUM_RPC" --fork-block-number 245000000
```

Anvil forks an EVM chain whose RPC serves past state: `eth_getStorageAt`, and blocks named by their hash. A chain whose RPC lacks them runs against its live state.

The test changes what it needs on the chain, then goes through the dapp as a user would:

```ts
it('liquidates a position under water', () => {
  cy.visit('/trade/ETH-PERP');
  cy.contains('button', 'Connect').click();
  cy.connectToDapp();
  cy.setStorageAt(oracle, priceSlot, lowPrice); // the oracle's price falls
  cy.contains('button', 'Liquidate').click();
  cy.confirmTransaction();
  cy.contains('Position closed').should('be.visible');
});
```

| Command                                 | What it does on the chain the dapp is on                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `cy.setStorageAt(address, slot, value)` | Writes a contract's storage, then mines a block: an oracle's price, a balance, a flag.                            |
| `cy.increaseTime(seconds)`              | Moves the clock forward, then mines a block: funding, expiries, vesting.                                          |
| `cy.mine(blocks?)`                      | Mines blocks, one by default.                                                                                    |
| `cy.rpc(method, params?)`               | Sends any JSON-RPC request, and yields its result: `anvil_setBalance`, `eth_getBalance`, anything the node takes. |

The first three need a development node, as a real chain refuses to rewrite storage or move its clock: Anvil, a fork it runs, or Hardhat Network. They send Hardhat's method names, which Anvil takes too. `cy.rpc()` works on any node, a testnet included, and with the real MetaMask too. A chain the mock has no RPC for, or one the dapp only switches to, is named with the `chains` option: `{ '0x…': 'https://…' }`.

### Where each answer comes from

| What                                                                   | Where it comes from                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| Identity flags (`isMetaMask`, `isRabby`…), the EIP-6963 announcement   | The wallet's profile                                |
| A rejection: its code, message and data                                | The wallet's profile                                |
| A method the wallet lacks, a chain switch it refuses, a constant answer | The wallet's profile                               |
| Balances, blocks, calls, gas, nonces                                   | The chain the dapp is on: its RPC, a fork, or Anvil |
| Signatures, and the signature of a transaction                         | Anvil, with its accounts                            |

## Commands

The same commands drive the real MetaMask and the mocks.

### Connection

| Command                          | What it does                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `cy.connectToDapp()`             | Accepts the connection request, then switches the dapp to the network of your wallet setup.         |
| `cy.connectToDapp({ accounts })` | Same, but connects only the listed accounts, for example `['Account 1', 'Account 2']`.               |
| `cy.rejectConnection()`          | Rejects the connection request.                                                                      |
| `cy.disconnectFromDapp()`        | Disconnects the dapp in the wallet. The dapp receives an empty `accountsChanged`.                    |
| `cy.getAccountAddress()`         | Yields the address the dapp is connected with.                                                       |
| `cy.getWallet()`                 | Yields the wallet under test as a wallet picker names it, `{ name: 'Rabby Wallet', version, mock }`. |

### Signatures and transactions

| Command                           | What it does                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `cy.confirmSignature()`           | Signs the message (`personal_sign`, `eth_signTypedData_*`).                                                        |
| `cy.rejectSignature()`            | Rejects the signature request.                                                                                     |
| `cy.confirmTransaction(options?)` | Confirms the transaction, ERC-20 approvals included. Options set the spending cap or the gas fee first: see below. |
| `cy.rejectTransaction()`          | Rejects the transaction.                                                                                           |

### Networks and tokens

| Command                     | What it does                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `cy.useNetwork(network?)`   | Switches the dapp to a network, and adds it to the wallet if needed. Defaults to your wallet setup. |
| `cy.approveNewNetwork()`    | Accepts a `wallet_addEthereumChain` request.                                                        |
| `cy.rejectNewNetwork()`     | Rejects it.                                                                                         |
| `cy.approveSwitchNetwork()` | Accepts a `wallet_switchEthereumChain` request to a network the dapp has no permission on yet.      |
| `cy.rejectSwitchNetwork()`  | Rejects it.                                                                                         |
| `cy.approveAddToken()`      | Accepts a `wallet_watchAsset` request.                                                              |
| `cy.rejectAddToken()`       | Rejects it.                                                                                         |

### Accounts and wallet

| Command                        | What it does                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `cy.addAccount()`              | Creates an account and selects it. Yields its name, for example `Account 2`.                         |
| `cy.importAccount(privateKey)` | Imports an account from a private key and selects it. Yields its name. The key stays out of the log. |
| `cy.switchAccount(name)`       | Selects an account by its name.                                                                      |
| `cy.lockWallet()`              | Locks the wallet. Requests then wait until it is unlocked.                                           |
| `cy.unlockWallet()`            | Unlocks the wallet. Yields `locked` if it was locked, `unlocked` if there was nothing to do.         |
| `cy.setupMetaMask()`           | Imports or unlocks the wallet. Runs by itself before each spec, unless `autoSetup` is `false`.       |

The chain commands, `cy.setStorageAt()`, `cy.increaseTime()`, `cy.mine()` and `cy.rpc()`, are in [Your chain, at your block](#your-chain-at-your-block).

### Transaction options

```ts
// ERC-20 approval: allow the spender 2.5 tokens, whatever the dapp asked for
cy.confirmTransaction({ spendingCap: '2.5' });

// One of the fee levels MetaMask offers
cy.confirmTransaction({ gas: 'aggressive' });

// Custom fees, in GWEI, as in MetaMask's advanced fee form
cy.confirmTransaction({ gas: { maxBaseFee: 30, priorityFee: 2, gasLimit: 100000 } });
```

| Option        | Value                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spendingCap` | The amount the spender may use, in tokens: `5` or `'2.5'`. Use a string to avoid rounding. Fails if the transaction is not an ERC-20 approval.                                                            |
| `gas`         | A fee level: `'low'`, `'market'` or `'aggressive'`, on the real MetaMask only. On a network with no fee estimates, such as a local node, and on the mocks, use `'networkSuggested'`. Fails if the level is not offered. |
| `gas`         | Or custom values: `maxBaseFee` and `priorityFee` in GWEI, and `gasLimit`. A missing field keeps the wallet's value. EIP-1559 transactions only.                                                           |

Both options can be combined. MetaMask remembers the fee chosen for an account on a network and starts the next transaction from it.

## Configuration

Settings come from three places:

- **`cypress/wallet.setup.ts`** for the network. It accepts `network` and `seedPhrase` only, and any other key is an error. Keep the seed phrase out of it, since this file is committed.
- **Environment variables or `cypress.env.json`** for secrets, the MetaMask version and the mock.
- **The third argument of `configureDappress()`** for everything else:

```ts
setupNodeEvents(on, config) {
  return configureDappress(on, config, { cache: true, timeout: 30000 });
}
```

When a setting appears in several places, the first one found wins: environment variable, then `cypress.env.json`, then `wallet.setup.ts`, then `configureDappress()`.

### For both

| Option    | Environment variable | Default and meaning                                                                                                    |
| --------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `network` |                      | None. The network `cy.connectToDapp()` and `cy.useNetwork()` switch to.                                                |
| `timeout` |                      | `20000` ms. How long a command waits for the wallet to show each screen, or for the dapp to send the request.          |
| `chains`  |                      | None. The RPC of a chain, by chain id, `{ '0x…': 'https://…' }`, for the mock and the chain commands. A chain the dapp adds, and a fork Anvil runs, need none. |

### For the real MetaMask

| Option             | Environment variable         | Default and meaning                                                                                                                                                   |
| ------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seedPhrase`       | `DAPPRESS_SEED_PHRASE`       | None. A new wallet is created for each run. It is never written to disk.                                                                                              |
| `password`         | `DAPPRESS_PASSWORD`          | `Tester@1234`. It only protects the throwaway browser profile of the run.                                                                                             |
| `metamaskVersion`  | `DAPPRESS_METAMASK_VERSION`  | `13.50.0`. Downloaded from MetaMask's GitHub releases on first use, then cached.                                                                                      |
| `metamaskChecksum` | `DAPPRESS_METAMASK_CHECKSUM` | The SHA-256 Dappress accepts the archive with. Known for the versions `src/config.ts` lists; set it for another version, which is otherwise loaded as downloaded, with a warning. |
| `autoSetup`        |                              | `true`. Set to `false` to call `cy.setupMetaMask()` yourself.                                                                                                         |
| `cache`            |                              | `false`. Importing the wallet takes about fifteen seconds per run. With `true`, Dappress imports it once and reuses the browser profile. Needs your own seed phrase and a headed run. |
| `backupAndSync`    |                              | `false`. Dappress turns off MetaMask's backup and sync, so accounts added by a test do not come back on the next run.                                                 |
| `cacheDir`         |                              | `~/.cache/dappress`. Where MetaMask builds and the wallet cache are kept.                                                                                             |

### For the mocks

| Option   | Environment variable | Default and meaning                                                                                                                        |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `mock`   | `DAPPRESS_MOCK`      | None, which runs the real MetaMask. The wallet to mock: `metamask`, `rabby`, `phantom`, or the path of a [profile](#wallet-profiles) you recorded. |
| `rpcUrl` | `DAPPRESS_RPC_URL`   | `http://127.0.0.1:8545`. Where the mock's keys are: Anvil, whose unlocked accounts sign. Also the chain of a chain the mock has no RPC for. |

## Wallet profiles

A profile is what a dapp sees of a wallet, recorded on the real wallet, request by request and event by event: what each method answers, the code and message of each rejection, the events and their payloads. It is what a mock replays. Profiles of MetaMask (written by the conformance suite at each release), Rabby and Phantom (recorded by hand) ship with Dappress, in [`reports/profiles`](reports/profiles).

`npm run profile -- diff <a> <b>` lists where two wallets answer differently. ### Record a wallet

A wallet that is not there yet, or a newer version of one, takes a few minutes to record, in the browser where it is installed:

```sh
npx dappress probe
```

The command starts Anvil and a page on your machine, and prints the page's URL. Open it, pick the wallet, and follow it: the page sends the wallet the requests of the conformance suite one by one, and says each time whether to accept or reject. At the end it shows where the wallet differs from MetaMask, and downloads its profile, which a mock replays at once: `configureDappress(on, config, { mock: './rabby-0.95.0.json' })`.

Use a test wallet: the profile holds its addresses and the signatures made on the page. It needs [Anvil](https://getfoundry.sh), as the mocks do. Ctrl+C stops the page and Anvil. To share the profile, see [CONTRIBUTING.md](CONTRIBUTING.md#wallet-profiles).

## Cypress, and only Cypress

A wallet driver is screen-by-screen code: selectors, the waits between a button and the next screen. That code cannot be shared across test frameworks without serving each one worse, so Dappress serves one, natively: the commands run in the browser Cypress launches, through Cypress's own plugin and task APIs, with nothing else in the process.

## Security

Dappress reads a seed phrase and drives a wallet. What it does with them, in short; [SECURITY.md](https://github.com/blassaut/dappress/blob/main/SECURITY.md) has the details, a way to check each point, and how to report a flaw.

- **Secrets stay in Node.js.** The seed phrase and the password are typed into MetaMask's own screens and go nowhere else: not the browser side, not the logs. Without a seed phrase, one is generated on your machine.
- **One download, checked.** The MetaMask build, from MetaMask's GitHub releases, once per version, against the SHA-256 Dappress knows for it. No other host, no telemetry. A mock wallet talks to the RPC endpoint you name, and nothing else.
- **No request of its own to the wallet** beyond `eth_accounts`, `eth_chainId` and `wallet_addEthereumChain`. A signature or a transaction only comes from your dapp.
- **A package you can check.** Four dependencies, no install script, published by GitHub Actions as a trusted publisher with a provenance attestation, and built again from its tag after every release: the "Reproducible build" badge above.
- **Use a test wallet.** A seed phrase made for testing, funded on test networks only, and not a well-known one such as Hardhat's or Anvil's: MetaMask restores the accounts other people saved for it. With `cache: true`, treat `~/.cache/dappress/profiles` like the seed phrase.

## Troubleshooting

A run that fails now and then: run it with `DAPPRESS_DEBUG=1`. Dappress logs each command and its duration, and the browser's tabs and workers as they come and go. Add `DEBUG=cypress:launcher:browsers` for Chrome's own log, its crashes included.

- **Cypress exits immediately with `MODULE_NOT_FOUND`.** Your terminal sets `ELECTRON_RUN_AS_NODE=1`, as some IDEs do. Run `env -u ELECTRON_RUN_AS_NODE npx cypress run …`.
- **"MetaMask showed no confirmation".** The dapp sent no request, or the network's RPC endpoint is unreachable.
- **A mock says "The dapp sent no … request".** The dapp did not ask the wallet for what the command decides on. The log line after it often says why: the wallet refused without asking, as recorded.
- **Adding or importing an account never finishes.** `chromeWebSecurity: false` is set in your Cypress config. MetaMask then cannot start the snaps its account screens wait for. Remove that setting.
- **The wallet shows accounts you did not create.** The seed phrase is used elsewhere, and MetaMask restored what it saved for it. Use a phrase made for your tests, or none.
- **On Chrome 155, a run fails now and then: MetaMask asks for its password again or shows a request late, or `cy.task()` is refused as not called from the spec.** Chrome 155 kills its own network service when a request reuses an ID under DevTools interception, which Cypress uses ([crbug.com/559770861](https://crbug.com/559770861)). MetaMask's background restarts, and so does Cypress's link to its tasks. Chrome 156 fixes it; until it is stable, use 154 or 156: `npx @puppeteer/browsers install chrome@154`. The browser's own log says `Network service crashed or was terminated`.
- **"MetaMask extension not found in the browser".** The browser did not load the extension. Most often it is Google Chrome 137 or later, which no longer loads extensions. Use Chrome for Testing: see [The browser](#the-browser).

## Contributing

How Dappress works, how to run the conformance suite, update to a new MetaMask release and publish a version: see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
