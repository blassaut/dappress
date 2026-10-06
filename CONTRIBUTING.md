# Contributing to Dappress

## Development

```sh
npm run check           # lint, formatting, types and unit tests: what CI and the release run
npm run format          # Prettier, on everything but the Markdown files
npm run build           # compiles the package into dist
```

`npm run lint`, `npm run format:check`, `npm run check-types` and `npm test` are the parts of `check`. The CI workflow runs `check` and `build` on every pull request.

## How it works

Cypress runs the tests inside the dapp's tab and has no access to the extension. For each command, Dappress connects Puppeteer to the browser Cypress launched, through the debugging URL Cypress provides, finds the MetaMask page that shows the request, and interacts with it.

MetaMask shows requests in its side panel when the panel is open, and in its popup window otherwise. Without the cache, the wallet import ends by opening the side panel, so requests appear there. With the cache, the wallet was imported in another browser, the panel is closed, and requests appear in the popup. Dappress handles both, and the conformance suite tests both.

Cypress leaves extensions out of a headless launch, so Dappress passes MetaMask to Chrome itself. Headless Chrome shows the side panel but never opens the popup window. That is why the cache, whose requests appear in the popup, works in headed runs only.

With `cache: true`, Dappress imports the wallet once before the run, in a browser of its own, and keeps the profile. MetaMask's storage is then copied into the profile Cypress is about to launch, so each run starts from a wallet that has never seen the dapp.

Selectors are MetaMask's `data-testid` attributes, each with the button's English label as a fallback. MetaMask's pages run under LavaMoat, which rejects injected scripts, so the helpers only use what Puppeteer can do from outside the page.

```
src/index.ts                  configureDappress(): plugin entry point
src/config.ts                 options, their three sources, the wallet setup file
src/download.ts               download, check and unpack of MetaMask builds
src/browser.ts                Puppeteer connection to the Cypress browser
src/wallet-cache.ts           the wallet imported once and reused across runs (cache: true)
src/metamask-pages.ts         MetaMask's pages: home, side panel, popup
src/metamask-selectors.ts     MetaMask's screens: what to click, by which selector
src/metamask-wallet.ts        the wallet's own screens: onboarding, unlock, accounts, menu, permissions
src/metamask-confirmation.ts  the confirmation of a request: which button, pressed until it goes
src/metamask-transaction.ts   what a transaction's confirmation lets the test set: spending cap, fee
src/metamask-modal.ts         the modals MetaMask shows over any screen
src/metamask.ts               the above, as the tasks drive it
src/mock-wallet.ts            the mock wallet: a provider in the page that replays a profile
src/wallet-profile.ts         the wallet profile format, and the profiles the package ships
src/keys.ts                   the address of a private key, for the mock
src/page-helpers.ts           wait, click and fill primitives with fallback selectors
src/actions.ts                Cypress tasks behind the commands
src/support.ts                cy.* commands
src/types.ts                  types of the public API
conformance/                  conformance suite, and the recorder of wallet profiles
scripts/                      conformance runner, matrix, wallet profiles, release notes
```

## Conformance suite

The suite runs one test per command against [MetaMask's test dapp](https://metamask.github.io/test-dapp/). Each run creates a fresh wallet with Foundry's `cast` and starts a local [Anvil](https://getfoundry.sh) node that funds it. It needs Chrome for Testing (`npx @puppeteer/browsers install chrome@stable`) and Foundry (`curl -L https://foundry.paradigm.xyz | bash`, then `foundryup`).

```sh
npm run conformance                            # default MetaMask version, side panel
npm run conformance -- 13.51.0                 # a specific release
DAPPRESS_MODE=headless npm run conformance     # without a browser window
DAPPRESS_MODE=popup npm run conformance        # wallet from the wallet cache: requests in the popup
DAPPRESS_BROWSER=/path/to/chrome npm run conformance   # a browser Cypress does not detect
DAPPRESS_MODE=mock DAPPRESS_MOCK=rabby npm run conformance   # the mock wallet, on a profile: no MetaMask, Electron
```

The mock mode writes `reports/mock-<wallet>-<version>.json`, and the matrix a table by wallet. The suite is written for MetaMask: on MetaMask's own profile every command has to pass, and the run fails otherwise; on another wallet's, what fails is what that wallet does differently, and the run passes with the report. MetaMask's test dapp replaces `window.ethereum` with a shim of its own when the provider announced through EIP-6963 is not MetaMask's, so the suite talks to the wallet through the provider it kept at page load (`cypress/support/provider.ts`).

A mode is where MetaMask shows the dapp's requests: `sidepanel` (the default), `headless` or `popup`. Each run writes `reports/metamask-<version>-<mode>.json`. `npm run matrix -- reports .` turns the reports into `MATRIX.md` and `badge.json`, a [shields.io endpoint](https://shields.io/badges/endpoint-badge) for the latest version.

A GitHub workflow runs the suite every day, in the three modes, against the latest MetaMask release that has no report yet. It publishes the reports, the matrix and the badge on the [`conformance-reports`](https://github.com/blassaut/dappress/tree/conformance-reports) branch.

## Wallet profiles

A dapp breaks from one wallet to the next on what the wallet answers: the code of a rejection, the format of `chainChanged`, a method one wallet has and another has not. A wallet profile records those answers on the real wallet: each request with its result or error, each event with its payload, and how the provider turned up, grouped by method and by event. Nothing is interpreted, and what was not observed is not in the profile. The format is in `scripts/profile.ts`, schema `dappress-wallet-profile/0`.

`reports/profiles/` on `main` holds one profile per wallet, the reference for comparisons: MetaMask's, written by the conformance suite for the default version, and the ones recorded by hand. The suite's own output for every release goes to the `conformance-reports` branch. Comparing two profiles gives the list of what to check in a dapp before its users switch wallets:

```sh
npm run profile -- diff reports/profiles/metamask-13.50.0-headless.json reports/profiles/rabby-0.94.11.json
```

One row per method and per event, and `no` where the two wallets answer differently.

### Recording a wallet

It takes about twenty minutes. Disable the other wallet extensions first: two wallets active inject two providers, and the profile would mix what each answers. And use a wallet made for testing, never your own: the profile holds everything the dapp saw, your accounts' addresses and the signatures you made included, and it is published.

1. Open [MetaMask's test dapp](https://metamask.github.io/test-dapp/), open the console, and paste the content of `conformance/recorder.js` in it before touching the page.
2. Click through the dapp: connect, each signature, a transaction, a network to add and one to switch to, a token to watch. Accept each once, then do it again and reject it. `conformance/cypress/e2e/actions.cy.ts` is the list the MetaMask profile is recorded from.
3. In the console, `copy(JSON.stringify(window.__dappressTrace))`, and paste it in a file, say `trace.json`. If the clipboard fails you, this downloads it instead: `const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(window.__dappressTrace)])); a.download = 'trace.json'; a.click();`
4. `npm run profile -- build trace.json --wallet Rabby --version 0.94.11 --out reports/profiles/rabby-0.94.11.json`.

Then run the diff above against the MetaMask profile, and open a pull request with the profile in `reports/profiles/`: the workflow publishes what that folder holds with the suite's own, and the next person with a dapp to check has it.

### How the recorder works

`conformance/recorder.js` has no dependency: it runs from Cypress and pasted in a console alike. It wraps `request()` on `window.ethereum` and on every provider announced through EIP-6963, listens to their events, and says on each entry which provider it went through (`via`): Rabby and Phantom announce another object than `window.ethereum`, and emit their events on both. For MetaMask, the suite puts the recorder in the page before the dapp loads (`conformance/cypress/support/e2e.ts`); the three modes must give the same profile apart from the values signed, sent or mined, and a difference between them is a hole in the recorder, not in MetaMask.

## Signing

Commits and tags are signed, so GitHub shows them as verified. Add a signing key to your GitHub account ([SSH](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification#ssh-commit-signature-verification) is the simplest), then:

```sh
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

## Updating to a new MetaMask release

1. Run the suite. Each failure points to a screenshot of the MetaMask screen at that moment.
2. Find the new selector in MetaMask's page objects, `github.com/MetaMask/metamask-extension/tree/v<version>/test/e2e/page-objects/pages`, and update `src/metamask-selectors.ts`.
3. Run the suite against the new release and the previous one.
4. Bump the default version in `src/config.ts` and in the README, and add the archive's SHA-256 to `METAMASK_CHECKSUMS` in `src/config.ts`: `shasum -a 256 ~/.cache/dappress/metamask/metamask-chrome-<version>.zip`.
5. Replace MetaMask's profile in `reports/profiles/` with the one the suite wrote for the new version.

## Releasing

1. Move what `CHANGELOG.md` lists under "Unreleased" to a section for the new version, and set the version in `package.json` (`npm version <version> --no-git-tag-version`).
2. Commit, then tag the commit `v<version>` with `git tag -s`, and push the tag. A tag made from GitHub's API or interface carries no signature: make it from a machine with your signing key.

The release workflow runs `npm run check`, checks the tag against `package.json`, publishes the package to npm and creates a GitHub release from the version's section of the changelog. npm trusts the workflow itself ([trusted publishing](https://docs.npmjs.com/trusted-publishers)): no npm token is stored.

Once npm serves the version, the [Reproducible build](.github/workflows/reproducible.yml) workflow builds the tag again, compares the result with the tarball npm serves, and verifies npm's signature and provenance of the version. Run it by hand, with a version, to check an older release.
