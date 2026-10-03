# Dappress

**MetaMask automation for Cypress.**

[![MetaMask conformance](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/blassaut/dappress/conformance-reports/badge.json)](https://github.com/blassaut/dappress/blob/conformance-reports/MATRIX.md)

Dappress loads the MetaMask browser extension into the browser Cypress launches, imports a test wallet, and exposes `cy.*` commands that answer the requests a dapp sends to the wallet: connection, signatures, transactions, network changes.

- **Current MetaMask.** The extension version is a configuration value. Each release is verified by a conformance suite, with one test per command.
- **Cypress native.** No second browser, no proxy. Dappress drives MetaMask through Puppeteer, connected to the browser Cypress already runs. Typed commands for TypeScript projects.
- **Resilient selectors.** Every selector comes from MetaMask's own end-to-end test suite and carries a fallback.

## Requirements

| Dependency | Version |
|---|---|
| Cypress | 13.6 or later |
| Node.js | 20 or later |
| Browser | Chrome for Testing, Chromium or Electron. Google Chrome 137 and later cannot load extensions. |

## Installation

```bash
npm install --save-dev dappress
```

Register the plugin in the Cypress configuration:

```ts
// cypress.config.ts
import { defineConfig } from 'cypress';
import { configureDappress } from 'dappress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    testIsolation: false, // the wallet state is shared across tests
    setupNodeEvents(on, config) {
      return configureDappress(on, config);
    },
  },
});
```

Load the commands in the support file:

```ts
// cypress/support/e2e.ts
import 'dappress/support';
```

Describe the test wallet:

```ts
// cypress/wallet.setup.ts
import type { WalletSetup } from 'dappress';

const wallet: WalletSetup = {
  // The network the dapp is moved onto when it connects
  network: {
    chainId: '0x88bb0',
    chainName: 'Hoodi',
    rpcUrls: ['https://ethereum-hoodi-rpc.publicnode.com'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
};

export default wallet;
```

Without a seed phrase, Dappress makes a new wallet for each run: enough to connect and sign. To test with a wallet of yours, one that holds test funds for instance, give its seed phrase and keep it out of the repository, in `cypress.env.json` (git-ignored):

```json
{
  "DAPPRESS_SEED_PHRASE": "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
}
```

In CI, provide it as an encrypted secret of the repository, exposed to the job as an environment variable:

```yaml
# GitHub Actions
env:
  DAPPRESS_SEED_PHRASE: ${{ secrets.DAPPRESS_SEED_PHRASE }}
```


Add the command types to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["cypress", "dappress/support"]
  }
}
```

JavaScript projects use the same files with a `.js` extension and `module.exports`.

Run the tests in a browser that supports extensions:

```bash
npx cypress run --browser chrome-for-testing --headed
```

Without `--headed`, the run is headless and works the same, except for the wallet cache, which needs a headed browser.

## Usage

```ts
it('connects the wallet and signs in', () => {
  cy.visit('/');
  cy.contains('button', 'Connect wallet').click();
  cy.connectToDapp();
  cy.getAccountAddress().should('match', /^0x[0-9a-f]{40}$/);

  cy.contains('button', 'Sign in').click();
  cy.confirmSignature();
});
```

The wallet is imported once, before the first test of each spec. Each command waits for MetaMask to display the request, answers it, and waits for the request to be dismissed.

### Commands

| Command | What it does |
|---|---|
| `cy.connectToDapp()` | Accepts the connection request, then moves the dapp onto the network of the wallet setup |
| `cy.rejectConnection()` | Rejects the connection request |
| `cy.confirmSignature()` | Signs the message (`personal_sign`, `eth_signTypedData_*`) |
| `cy.rejectSignature()` | Rejects the signature request |
| `cy.confirmTransaction()` | Sends the transaction, including ERC-20 approvals |
| `cy.rejectTransaction()` | Rejects the transaction |
| `cy.approveNewNetwork()` | Adds the network requested by `wallet_addEthereumChain` |
| `cy.rejectNewNetwork()` | Rejects the network |
| `cy.approveSwitchNetwork()` | Grants the permission asked by `wallet_switchEthereumChain` for a network the dapp is not yet allowed on |
| `cy.rejectSwitchNetwork()` | Denies that permission |
| `cy.approveAddToken()` | Adds the token requested by `wallet_watchAsset` |
| `cy.rejectAddToken()` | Rejects the token |
| `cy.addAccount()` | Adds an account to the wallet and selects it. Yields its name, such as `Account 2`. |
| `cy.importAccount(privateKey)` | Imports an account from its private key and selects it. Yields its name. The key stays out of the command log. |
| `cy.switchAccount(name)` | Selects an account of the wallet by its name |
| `cy.useNetwork(network?)` | Moves the dapp onto a network, adding it to MetaMask when needed. Defaults to the network of the wallet setup. |
| `cy.getAccountAddress()` | Yields the address the dapp is connected with |
| `cy.setupMetaMask()` | Imports the wallet, or unlocks it. Called automatically before each spec. |

### Configuration

Settings normally live in `cypress/wallet.setup.ts`. Secrets go in `cypress.env.json` or in environment variables, which take precedence. The full order, first one found wins:

1. Environment variables, for secrets in CI.
2. `cypress.env.json`, for secrets on a development machine, such as the seed phrase.
3. `cypress/wallet.setup.ts`, for everything else.
4. The third argument of `configureDappress(on, config, options)`.

| Option | Environment variable | Default |
|---|---|---|
| `metamaskVersion` | `DAPPRESS_METAMASK_VERSION` | `13.50.0`. The build is downloaded from MetaMask's GitHub releases on first run and cached in `~/.cache/dappress`. |
| `seedPhrase` | `DAPPRESS_SEED_PHRASE` | None. Dappress makes a new wallet for each run, which nobody else knows and which is never written anywhere. |
| `password` | `DAPPRESS_PASSWORD` | `Tester@1234`. It only protects the throwaway browser profile Cypress creates for each run. |
| `network` | | None. The dapp stays on the network MetaMask starts on, Ethereum mainnet. |
| `backupAndSync` | | `false`. Dappress turns off MetaMask's backup and sync while importing the wallet, so that an account a test adds is not restored by the next import of the same seed phrase. With `true`, MetaMask keeps saving and restoring the accounts and contacts of that phrase. |
| `autoSetup` | | `true`. Dappress imports or unlocks the wallet before the first test of each spec. Set to `false` to call `cy.setupMetaMask()` yourself. |
| `cache` | | `false`. The wallet is imported in every run, about fifteen seconds. With `true`, and a seed phrase of your own, it is imported once, in a browser Dappress opens before the run, and the resulting profile is reused by later runs, which then start by unlocking the wallet. Headed runs only: a headless run imports the wallet as usual. |
| `timeout` | | `20000` ms. The time allowed for MetaMask to display a request before a command fails. |

### Security

When you give a seed phrase, make it one dedicated to testing, funded on test networks only. Avoid a phrase other people know, such as the Hardhat or Anvil development mnemonic: MetaMask restores the accounts others saved for it, so the wallet is not the one you expect. The seed phrase and password remain on the Node.js side: they are never exposed to the browser nor written to the Cypress command log. The wallet setup file contains no secret and can be committed.

With `cache: true`, the profile under `~/.cache/dappress/profiles` holds the wallet's vault, encrypted by MetaMask with the password. Treat that directory like the seed phrase: keep it on the machine, and do not store it in a CI cache that other people or workflows can restore.

## Conformance suite

The suite runs one test per command against [MetaMask's test dapp](https://metamask.github.io/test-dapp/). Each run makes a wallet nobody has used, with Foundry's `cast`, and starts a local [Anvil](https://getfoundry.sh) node that funds it. It requires Chrome for Testing and Foundry.

```bash
npm run conformance                            # default MetaMask version, side panel
npm run conformance -- 13.51.0                 # a specific release
DAPPRESS_MODE=headless npm run conformance     # without a browser window
DAPPRESS_MODE=popup npm run conformance        # wallet from the profile cache: requests in the popup
```

A mode is where MetaMask shows the dapp's requests: `sidepanel` (the default), `headless`, or `popup`. Each run writes `reports/metamask-<version>-<mode>.json`, and `npm run matrix -- reports .` turns the reports into `MATRIX.md` and `badge.json`, a [shields.io endpoint](https://shields.io/badges/endpoint-badge) for the latest version.

The GitHub workflow runs the suite daily, in the three modes, against the latest MetaMask release that has no report yet, and publishes the reports, the matrix and the badge on the [`conformance-reports`](https://github.com/blassaut/dappress/tree/conformance-reports) branch: [MATRIX.md](https://github.com/blassaut/dappress/blob/conformance-reports/MATRIX.md).

### Updating to a new MetaMask release

1. Run the suite. Each failure names a screenshot of the MetaMask screen at that moment.
2. Locate the new selector in MetaMask's page objects: `github.com/MetaMask/metamask-extension/tree/v<version>/test/e2e/page-objects/pages`.
3. Update `src/metamask.js`, run the suite against the new and the previous release, bump the default version in `src/config.js`, and commit the report.

## Architecture

Cypress executes tests inside the dapp's tab and has no access to the extension. For each command, Dappress connects Puppeteer to the browser Cypress launched, through the debugging URL Cypress provides, locates the MetaMask page displaying the request and interacts with it.

MetaMask displays requests in its side panel when the panel is open, and in its popup window otherwise. Without the cache, the import of the wallet ends by opening the side panel, so requests appear there. With the cache, the wallet was imported in another browser, the panel is closed, and requests appear in the popup. Dappress handles both, and the conformance suite runs in both: its `popup` mode turns the cache on.

Cypress leaves extensions out of a headless launch, so Dappress passes MetaMask to Chrome itself. Headless Chrome displays the side panel but does not open the popup window, which is why the cache, whose requests appear in the popup, is limited to headed runs.

With `cache: true`, Dappress imports the wallet once before the run, in a browser of its own, and keeps the profile; MetaMask's storage is copied from it into the profile Cypress is about to launch, so each run starts from a wallet that has never seen the dapp.

```
src/index.js            configureDappress(): plugin entry point
src/config.js           options and wallet setup file
src/download.js         download and cache of MetaMask builds
src/browser.js          Puppeteer connection to the Cypress browser
src/profile.js          wallet profile built once and reused across runs
src/metamask-pages.js   discovery of MetaMask's pages
src/metamask.js         MetaMask screens: selectors and flows
src/page-helpers.js     wait, click and fill primitives with fallback selectors
src/actions.js          Cypress tasks behind the commands
src/support.js          cy.* commands
types/                  TypeScript declarations
conformance/            conformance suite
```

Selectors are MetaMask's `data-testid` attributes, each with the button's English label as a fallback. MetaMask's pages run under LavaMoat, which rejects injected scripts; the helpers therefore rely only on what Puppeteer can do from outside the page.

## Troubleshooting

- **Cypress exits immediately with `MODULE_NOT_FOUND`.** The terminal sets `ELECTRON_RUN_AS_NODE=1`, as some IDEs do. Run `env -u ELECTRON_RUN_AS_NODE npx cypress run …`.
- **"MetaMask showed no confirmation".** The dapp sent no request, or sent it on a network whose RPC endpoint is unreachable.
- **Adding or importing an account never finishes.** `chromeWebSecurity: false` is set in the Cypress config. MetaMask then cannot start its snaps, which its account screens wait for. Leave Chrome's web security on, the Cypress default.
- **The wallet shows accounts you did not create.** The seed phrase is used elsewhere, and MetaMask restored what its cloud holds for it. This happens with well-known development mnemonics. Use a phrase made for your tests, or none.

## Status

Verified with MetaMask 13.49.0 and 13.50.0, Cypress 16 and Chrome for Testing 154: in headed mode on macOS and on GitHub's Linux runners, and in headless mode on macOS.

## License

MIT
