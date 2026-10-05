# Contributing to Dappress

## Development

```sh
npm run lint            # ESLint
npm run format          # Prettier, on everything but the Markdown files
npm run check-types     # TypeScript, on the sources, the scripts and the suite
npm test                # unit tests
npm run build           # compiles the package into dist
```

The CI workflow runs these on every pull request, with `format:check` in place of `format`.

## How it works

Cypress runs the tests inside the dapp's tab and has no access to the extension. For each command, Dappress connects Puppeteer to the browser Cypress launched, through the debugging URL Cypress provides, finds the MetaMask page that shows the request, and interacts with it.

MetaMask shows requests in its side panel when the panel is open, and in its popup window otherwise. Without the cache, the wallet import ends by opening the side panel, so requests appear there. With the cache, the wallet was imported in another browser, the panel is closed, and requests appear in the popup. Dappress handles both, and the conformance suite tests both.

Cypress leaves extensions out of a headless launch, so Dappress passes MetaMask to Chrome itself. Headless Chrome shows the side panel but never opens the popup window. That is why the cache, whose requests appear in the popup, works in headed runs only.

With `cache: true`, Dappress imports the wallet once before the run, in a browser of its own, and keeps the profile. MetaMask's storage is then copied into the profile Cypress is about to launch, so each run starts from a wallet that has never seen the dapp.

Selectors are MetaMask's `data-testid` attributes, each with the button's English label as a fallback. MetaMask's pages run under LavaMoat, which rejects injected scripts, so the helpers only use what Puppeteer can do from outside the page.

```
src/index.ts            configureDappress(): plugin entry point
src/config.ts           options and wallet setup file
src/download.ts         download and cache of MetaMask builds
src/browser.ts          Puppeteer connection to the Cypress browser
src/profile.ts          wallet profile built once and reused across runs
src/metamask-pages.ts   discovery of MetaMask's pages
src/metamask.ts         MetaMask screens: selectors and flows
src/page-helpers.ts     wait, click and fill primitives with fallback selectors
src/actions.ts          Cypress tasks behind the commands
src/support.ts          cy.* commands
src/types.ts            types of the public API
conformance/            conformance suite
```

## Conformance suite

The suite runs one test per command against [MetaMask's test dapp](https://metamask.github.io/test-dapp/). Each run creates a fresh wallet with Foundry's `cast` and starts a local [Anvil](https://getfoundry.sh) node that funds it. It needs Chrome for Testing and Foundry.

```sh
npm run conformance                            # default MetaMask version, side panel
npm run conformance -- 13.51.0                 # a specific release
DAPPRESS_MODE=headless npm run conformance     # without a browser window
DAPPRESS_MODE=popup npm run conformance        # wallet from the profile cache: requests in the popup
DAPPRESS_BROWSER=/path/to/chrome npm run conformance   # a browser Cypress does not detect
```

A mode is where MetaMask shows the dapp's requests: `sidepanel` (the default), `headless` or `popup`. Each run writes `reports/metamask-<version>-<mode>.json`. `npm run matrix -- reports .` turns the reports into `MATRIX.md` and `badge.json`, a [shields.io endpoint](https://shields.io/badges/endpoint-badge) for the latest version.

A GitHub workflow runs the suite every day, in the three modes, against the latest MetaMask release that has no report yet. It publishes the reports, the matrix and the badge on the [`conformance-reports`](https://github.com/blassaut/dappress/tree/conformance-reports) branch.

## Updating to a new MetaMask release

1. Run the suite. Each failure points to a screenshot of the MetaMask screen at that moment.
2. Find the new selector in MetaMask's page objects: `github.com/MetaMask/metamask-extension/tree/v<version>/test/e2e/page-objects/pages`.
3. Update `src/metamask.ts`, run the suite against the new and the previous release, bump the default version in `src/config.ts` and in the README, and commit the report.

## Releasing

1. Move what `CHANGELOG.md` lists under "Unreleased" to a section for the new version, and set the version in `package.json` (`npm version <version> --no-git-tag-version`).
2. Commit, then tag the commit `v<version>` with `git tag -s`, and push the tag. A tag made from GitHub's API or interface carries no signature: make it from a machine with your signing key.

The release workflow checks the tag against `package.json`, publishes the package to npm and creates a GitHub release from the version's section of the changelog. npm trusts the workflow itself ([trusted publishing](https://docs.npmjs.com/trusted-publishers)): no npm token is stored.

Once npm serves the version, the [Reproducible build](.github/workflows/reproducible.yml) workflow builds the tag again, compares the result with the tarball npm serves, and verifies npm's signature and provenance of the version. Run it by hand, with a version, to check an older release.

## Signing

Commits and tags are signed, so GitHub shows them as verified. Add a signing key to your GitHub account ([SSH](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification#ssh-commit-signature-verification) is the simplest), then:

```sh
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```
