# DappPress

MetaMask for your Cypress tests. DappPress loads the real MetaMask extension into the browser Cypress launches, imports a wallet, and gives you `cy.*` commands to accept or reject what your dapp asks the wallet.

Works with the latest MetaMask: the version is a setting, and a conformance suite checks each release.

## Requirements

- Cypress 13.6 or later, Node 20 or later
- Chrome for Testing (Chromium and Electron work too). Google Chrome 137+ can't load extensions.

## Quick start

```bash
npm install --save-dev dappress
```

```js
// cypress.config.js
const { defineConfig } = require('cypress');
const { configureDappPress } = require('dappress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    testIsolation: false, // the wallet is shared by the tests
    setupNodeEvents(on, config) {
      return configureDappPress(on, config);
    },
  },
});
```

```js
// cypress/support/e2e.js
import 'dappress/support';
```

```js
// cypress/wallet.setup.js
module.exports = {
  password: 'Tester@1234',
  // Optional: the network the dapp is moved onto when it connects
  network: {
    chainId: '0x88bb0',
    chainName: 'Hoodi',
    rpcUrls: ['https://ethereum-hoodi-rpc.publicnode.com'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
};
```

Put the seed phrase in `cypress.env.json` (git-ignored) as `DAPPRESS_SEED_PHRASE`, or in the environment variable of the same name. Without it, DappPress uses the public Hardhat / Anvil test wallet.

```bash
npx cypress run --browser chrome-for-testing --headed
```

## Write a test

```js
it('connects and signs in', () => {
  cy.visit('/');
  cy.contains('button', 'Connect wallet').click();
  cy.connectToDapp();
  cy.getAccountAddress().should('eq', '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');

  cy.contains('button', 'Sign in').click();
  cy.confirmSignature();
});
```

The wallet is imported before the first test of each spec. Each command waits for MetaMask to show the request, answers it, and waits for it to go away.

| Command | Answers |
|---|---|
| `cy.connectToDapp()` / `cy.rejectConnection()` | "Connect this website with MetaMask", then moves the dapp onto the wallet setup's network |
| `cy.confirmSignature()` / `cy.rejectSignature()` | A signature request (`personal_sign`, `eth_signTypedData_*`) |
| `cy.confirmTransaction()` / `cy.rejectTransaction()` | A transaction, including ERC-20 approvals |
| `cy.approveNewNetwork()` / `cy.rejectNewNetwork()` | "Add network" (`wallet_addEthereumChain`) |
| `cy.approveSwitchNetwork()` / `cy.rejectSwitchNetwork()` | The permission asked before switching to a network the dapp isn't allowed on yet |
| `cy.useNetwork(network?)` | Moves the dapp onto a network, adding it to MetaMask if needed. Defaults to the wallet setup's network. |
| `cy.getAccountAddress()` | Yields the connected address |
| `cy.setupMetaMask()` | Imports or unlocks the wallet. Runs by itself before each spec. |

Not yet: locking the wallet, switching accounts, importing extra accounts.

## Options

Set them in the wallet setup file, in `cypress.env.json`, as environment variables, or as the third argument of `configureDappPress()`.

| Option | Env var | Default |
|---|---|---|
| `metamaskVersion` | `DAPPRESS_METAMASK_VERSION` | `13.50.0` |
| `seedPhrase` | `DAPPRESS_SEED_PHRASE` | the Hardhat / Anvil test mnemonic |
| `password` | `DAPPRESS_PASSWORD` | `Tester@1234` |
| `network` | | none |
| `autoSetup` | | `true`, run `cy.setupMetaMask()` before each spec |
| `timeout` | | `20000` ms to wait for MetaMask to show a request |

Use a wallet made for testing, with test funds only: the default seed phrase is public. The seed phrase stays on the Node side and never reaches the browser or the Cypress log. The wallet setup file holds nothing secret, so it can be committed.

## Check a MetaMask release

The conformance suite runs one test per command against [MetaMask's test dapp](https://metamask.github.io/test-dapp/), with a local [Anvil](https://getfoundry.sh) node for the funded transaction:

```bash
npm run conformance               # the default MetaMask version
npm run conformance -- 13.51.0    # another release
```

It writes `reports/metamask-<version>.json`. The GitHub workflow runs it daily against the latest release that has no report yet.

When a command fails on a new release:

1. The error names a screenshot of the MetaMask screen at that moment.
2. Find the new selector in MetaMask's own page objects: `github.com/MetaMask/metamask-extension/tree/v<version>/test/e2e/page-objects/pages`.
3. Fix it in `src/metamask.js`, run the suite on the new and the previous release, bump the default version in `src/config.js`, commit the report.

## How it works

Cypress runs your test inside the dapp's tab and can't see the extension. So for each command, DappPress connects Puppeteer to the browser Cypress launched, finds the MetaMask page showing the request (the side panel, or the popup) and clicks on it.

```
src/index.js            configureDappPress(): plugin entry point
src/config.js           options and the wallet setup file
src/download.js         fetch and cache a MetaMask build
src/browser.js          Puppeteer connection to the Cypress browser
src/metamask-pages.js   find MetaMask's pages in the browser
src/metamask.js         MetaMask's screens: selectors and flows
src/page-helpers.js     wait / click / fill, with fallback selectors
src/actions.js          the Cypress tasks behind the commands
src/support.js          the cy.* commands
conformance/            one test per command
```

Selectors are MetaMask's own `data-testid`s, each with the button's English text as a fallback. MetaMask's pages run under LavaMoat, which blocks injected scripts, so the helpers only use what Puppeteer can do from outside the page.

## Troubleshooting

- **Cypress exits at once with `MODULE_NOT_FOUND`**: the terminal sets `ELECTRON_RUN_AS_NODE=1` (some IDEs do). Run `env -u ELECTRON_RUN_AS_NODE npx cypress run …`.
- **"MetaMask showed no confirmation"**: the dapp sent no request, or sent it on a network whose RPC is unreachable.

## Status

Early. Verified on MetaMask 13.49.0 and 13.50.0, Cypress 16, Chrome for Testing 154, macOS, headed mode. Headless runs and CI are not validated yet.

MIT license.
