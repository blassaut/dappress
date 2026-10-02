# Dappress

**MetaMask automation for Cypress.**

Dappress loads the MetaMask browser extension into the browser Cypress launches, imports a test wallet, and exposes `cy.*` commands that answer the requests a dapp sends to the wallet: connection, signatures, transactions, network changes.

- **Current MetaMask.** The extension version is a configuration value. Each release is verified by a conformance suite, with one test per command.
- **Cypress native.** No second browser, no proxy. Dappress drives MetaMask through Puppeteer, connected to the browser Cypress already runs.
- **Resilient selectors.** Every selector comes from MetaMask's own end-to-end test suite and carries a fallback.

## Requirements

| | |
|---|---|
| Cypress | 13.6 or later |
| Node.js | 20 or later |
| Browser | Chrome for Testing, Chromium or Electron. Google Chrome 137 and later cannot load extensions. |

## Installation

```bash
npm install --save-dev dappress
```

Register the plugin in the Cypress configuration:

```js
// cypress.config.js
const { defineConfig } = require('cypress');
const { configureDappress } = require('dappress');

module.exports = defineConfig({
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

```js
// cypress/support/e2e.js
import 'dappress/support';
```

Describe the test wallet:

```js
// cypress/wallet.setup.js
module.exports = {
  password: 'Tester@1234',
  // Optional. The network the dapp is moved onto when it connects.
  network: {
    chainId: '0x88bb0',
    chainName: 'Hoodi',
    rpcUrls: ['https://ethereum-hoodi-rpc.publicnode.com'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
};
```

Provide the seed phrase through `DAPPRESS_SEED_PHRASE`, either in `cypress.env.json` (git-ignored) or as an environment variable. When none is provided, Dappress uses the public Hardhat / Anvil development wallet.

Run the tests in a headed browser that supports extensions:

```bash
npx cypress run --browser chrome-for-testing --headed
```

## Usage

```js
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

| Command | Request answered |
|---|---|
| `cy.connectToDapp()` / `cy.rejectConnection()` | Connection request. On success, the dapp is moved onto the network declared in the wallet setup. |
| `cy.confirmSignature()` / `cy.rejectSignature()` | Signature request: `personal_sign`, `eth_signTypedData_*` |
| `cy.confirmTransaction()` / `cy.rejectTransaction()` | Transaction, including ERC-20 approvals |
| `cy.approveNewNetwork()` / `cy.rejectNewNetwork()` | `wallet_addEthereumChain` |
| `cy.approveSwitchNetwork()` / `cy.rejectSwitchNetwork()` | Permission request raised by `wallet_switchEthereumChain` for a network the dapp is not yet allowed on |
| `cy.useNetwork(network?)` | Moves the dapp onto a network, adding it to MetaMask when needed. Defaults to the wallet setup's network. |
| `cy.getAccountAddress()` | Yields the address the dapp is connected with |
| `cy.setupMetaMask()` | Imports or unlocks the wallet. Called automatically before each spec. |

Planned: locking the wallet, switching accounts, importing additional accounts.

### Configuration

Options are read, in order of precedence, from environment variables, `cypress.env.json`, `cypress/wallet.setup.js`, and the third argument of `configureDappress(on, config, options)`.

| Option | Environment variable | Default |
|---|---|---|
| `metamaskVersion` | `DAPPRESS_METAMASK_VERSION` | `13.50.0`. The build is downloaded from MetaMask's GitHub releases on first run and cached in `~/.cache/dappress`. |
| `seedPhrase` | `DAPPRESS_SEED_PHRASE` | `test test test test test test test test test test test junk`, the Hardhat / Anvil development wallet. Its first account is `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. |
| `password` | `DAPPRESS_PASSWORD` | `Tester@1234`. It only protects the throwaway browser profile Cypress creates for each run. |
| `network` | | None. The dapp stays on the network MetaMask starts on, Ethereum mainnet. |
| `autoSetup` | | `true`. `cy.setupMetaMask()` runs before the first test of each spec. |
| `timeout` | | `20000` ms. The time allowed for MetaMask to display a request before a command fails. |

### Security

Use a wallet dedicated to testing, funded on test networks only. The default seed phrase is public. The seed phrase and password remain on the Node.js side: they are never exposed to the browser nor written to the Cypress command log. The wallet setup file contains no secret and can be committed.

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

Cypress executes tests inside the dapp's tab and has no access to the extension. For each command, Dappress connects Puppeteer to the browser Cypress launched, through the debugging URL Cypress provides, locates the MetaMask page displaying the request (side panel or popup) and interacts with it.

```
src/index.js            configureDappress(): plugin entry point
src/config.js           options and wallet setup file
src/download.js         download and cache of MetaMask builds
src/browser.js          Puppeteer connection to the Cypress browser
src/metamask-pages.js   discovery of MetaMask's pages
src/metamask.js         MetaMask screens: selectors and flows
src/page-helpers.js     wait, click and fill primitives with fallback selectors
src/actions.js          Cypress tasks behind the commands
src/support.js          cy.* commands
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
