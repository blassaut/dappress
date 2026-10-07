# Security

Dappress reads a seed phrase and drives a wallet. The [Security section of the README](https://github.com/blassaut/dappress#security) says in five points what it does with them, what it talks to and what the package holds; this page has the details, and a way to check each point.

## Reporting a vulnerability

Report it privately, with GitHub's [private vulnerability reporting](https://github.com/blassaut/dappress/security/advisories/new): "Report a vulnerability" in the Security tab of the repository. Do not open a public issue, and do not describe it in a pull request. Expect an acknowledgement within a week.

A vulnerability is anything that would:

- let the seed phrase, the password or a private key leave the machine, reach the browser side or appear in a log;
- make the package reach a host other than MetaMask's GitHub releases, or send the wallet a request the README does not list;
- change what the published package holds compared with the build of its tag, through a dependency, a build step or the release workflow.

A flaw in MetaMask itself goes to [MetaMask](https://github.com/MetaMask/metamask-extension/security/policy). A known limit, not a vulnerability: the archive of a MetaMask version Dappress has no checksum for is loaded as downloaded, with a warning, unless `metamaskChecksum` pins it.

## What the package does, and how to check it

- **Your secrets.** The seed phrase and the password are read in Node.js, from the environment or `cypress.env.json` (`src/config.ts`), and typed into MetaMask's own onboarding and unlock screens (`src/metamask-wallet.ts`). They never reach the browser side: what the `cy.*` commands can read is the subset `publicOptions` in `src/config.ts` names, the MetaMask version, `autoSetup` and the network. They are never logged, and the private key given to `cy.importAccount()` is kept out of the Cypress command log. Without a seed phrase, a new one is generated on your machine with `@scure/bip39`.
- **One download, checked.** `src/download.ts` fetches the MetaMask build you asked for from [MetaMask's GitHub releases](https://github.com/MetaMask/metamask-extension/releases), once per version. It is the only URL in the package: `grep -r "https://" node_modules/dappress/dist`. Before the archive is unpacked, its SHA-256 is compared with the one `METAMASK_CHECKSUMS` in `src/config.ts` holds for the version; an archive with another digest is refused and removed. To check a listed digest yourself, download the archive from the release page and run `shasum -a 256` on it. `metamaskChecksum` sets the digest for a version the list has not.
- **Three requests to the wallet**, from `src/support.ts`: `eth_accounts` for `cy.getAccountAddress()`, `eth_chainId` and `wallet_addEthereumChain` for `cy.useNetwork()`. Dappress never asks the wallet for a signature or a transaction. Those are your dapp's requests, and Dappress presses the button you name on the screen they open. No telemetry, no analytics, nothing else on the network.
- **With a mock wallet** (`mock`), nothing is downloaded and no extension is loaded. The mock reaches the endpoint `rpcUrl` names, which holds the keys, and the RPC of each chain the dapp adds or `chains` names, and nothing else; the keys never reach the page, which sends Anvil what to sign; the private key given to `cy.importAccount()` is read once in Node.js for its address (`src/keys.ts`) and goes no further.
- **What you install.** Four dependencies, `@noble/hashes`, `@scure/bip39`, `fflate` and `puppeteer-core`, and no install script. The MetaMask archive is unpacked by Dappress's own code over `fflate`: an entry leading outside the folder refuses the archive, and no entry becomes a link. Every version is built and published by [a GitHub Actions workflow](.github/workflows/release.yml) from its tag, as an npm trusted publisher: no npm token exists, and the version carries a provenance attestation naming this repository, the workflow, the commit and the run. See the Provenance panel on [npmjs.com](https://www.npmjs.com/package/dappress), or run `npm audit signatures`. After each release, [another workflow](.github/workflows/reproducible.yml) builds the tag again, compares the result with the tarball npm serves, file by file, and verifies npm's signature and provenance of the version; its badge is in the README. To do it yourself: clone the repository, `git checkout v<version>`, `npm ci`, `npm run build`, and `dist` is byte for byte what `npm pack dappress@<version>` holds.

## Supported versions

The latest release. A fix ships as a new version: a version on npm is never changed once published.
