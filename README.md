# Dappress

**MetaMask automation for Cypress.**

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

Keep the seed phrase out of the repository, in `cypress.env.json` (git-ignored):

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

When neither is provided, Dappress uses the public Hardhat / Anvil development wallet. Give your test suite a seed phrase of its own: that one is shared with everybody.

Add the command types to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["cypress", "dappress/support"]
  }
}
```

JavaScript projects use the same files with a `.js` extension and `module.exports`.

Run the tests in a headed browser that supports extensions:

```bash
npx cypress run --browser chrome-for-testing --headed
```

## Usage

```ts
it('connects the wallet and signs in', () => {
  cy.visit('/');
  cy.contains('button', 'Connect wallet').click();
  cy.connectToDapp();
  cy.getAccountAddress().should('eq', '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');

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
| `seedPhrase` | `DAPPRESS_SEED_PHRASE` | `test test test test test test test test test test test junk`, the Hardhat / Anvil development wallet. Its first account is `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. |
| `password` | `DAPPRESS_PASSWORD` | `Tester@1234`. It only protects the throwaway browser profile Cypress creates for each run. |
| `network` | | None. The dapp stays on the network MetaMask starts on, Ethereum mainnet. |
| `backupAndSync` | | `false`. Dappress turns off MetaMask's backup and sync while importing the wallet, so every import starts from the same state: one account, no contact. With `true`, MetaMask restores the accounts and contacts saved for that seed phrase from other installs. |
| `autoSetup` | | `true`. Dappress imports or unlocks the wallet before the first test of each spec. Set to `false` to call `cy.setupMetaMask()` yourself. |
| `cache` | | `false`. The wallet is imported in every run, about fifteen seconds. With `true`, it is imported once, in a browser Dappress opens before the run, and the resulting profile is reused by later runs, which then start by unlocking the wallet. |
| `timeout` | | `20000` ms. The time allowed for MetaMask to display a request before a command fails. |

### Security

Use a wallet dedicated to testing, funded on test networks only. The default seed phrase is public: anyone can spend from it, and its accounts can carry activity nobody controls. It is fine for a first run, not for a test suite you rely on. The seed phrase and password remain on the Node.js side: they are never exposed to the browser nor written to the Cypress command log. The wallet setup file contains no secret and can be committed.

With `cache: true`, the profile under `~/.cache/dappress/profiles` holds the wallet's vault, encrypted by MetaMask with the password. Treat that directory like the seed phrase: keep it on the machine, and do not store it in a CI cache that other people or workflows can restore.

## Conformance suite

The suite runs one test per command against [MetaMask's test dapp](https://metamask.github.io/test-dapp/), with a local [Anvil](https://getfoundry.sh) node for the funded transaction. It requires Chrome for Testing and Foundry.

```bash
npm run conformance               # default MetaMask version
npm run conformance -- 13.51.0    # a specific release
```

Each run writes `reports/metamask-<version>.json`. The GitHub workflow runs the suite daily against the latest MetaMask release that has no report yet.

### Updating to a new MetaMask release

1. Run the suite. Each failure names a screenshot of the MetaMask screen at that moment.
2. Locate the new selector in MetaMask's page objects: `github.com/MetaMask/metamask-extension/tree/v<version>/test/e2e/page-objects/pages`.
3. Update `src/metamask.js`, run the suite against the new and the previous release, bump the default version in `src/config.js`, and commit the report.

## Architecture

Cypress executes tests inside the dapp's tab and has no access to the extension. For each command, Dappress connects Puppeteer to the browser Cypress launched, through the debugging URL Cypress provides, locates the MetaMask page displaying the request and interacts with it.

MetaMask displays requests in its side panel when the panel is open, and in its popup window otherwise. Without the cache, the import of the wallet ends by opening the side panel, so requests appear there. With the cache, the wallet was imported in another browser, the panel is closed, and requests appear in the popup. Dappress handles both, and the conformance suite covers both.

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

## Status

Verified with MetaMask 13.49.0 and 13.50.0, Cypress 16 and Chrome for Testing 154 on macOS, in headed mode. Headless execution and continuous integration are not validated yet.

## License

MIT
