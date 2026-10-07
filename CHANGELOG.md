# Changelog

What changes for the users of Dappress, version by version. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `DAPPRESS_DEBUG=1` logs what Dappress does with the browser, for a run that fails now and then. It logs each command's task and its duration, and the browser's tabs and workers as they come and go. It also turns on Chrome's own log, crashes included, which Cypress shows with `DEBUG=cypress:launcher:browsers`. Off by default, it changes nothing.

### Security

- The MetaMask archive is no longer unpacked by `extract-zip`, which lets an archive write outside its folder through a planted symlink (CVE-2026-19693, GHSA-7pqw-9j4j-h8q3 and GHSA-jmr9-qjv8-65gv, with no fixed version). Dappress now unpacks it itself, over `fflate`: an entry that leads outside the folder refuses the whole archive, and no entry becomes a link.
- `puppeteer-core` 25 no longer carries the proxy chain that brought `basic-ftp`, whose directory-listing parser can be made to spin (CVE-2026-102990, GHSA-c475-qrg2-pj4r), nor `extract-zip`. The package's tree goes from 86 packages to 33.

### Fixed

- A click no longer lands on an element that has no box yet: an element MetaMask has not laid out, or is redrawing, is no longer taken as still because its box stays empty.

### Changed

- The README says what fails on Chrome 155 and why: a Chrome bug kills its network service now and then under Cypress, which restarts MetaMask's background and refuses Cypress's tasks. The conformance workflow tests Chrome 156 in place of 155, and 154 as the previous major, until Chrome 156 is stable.
- Node.js 22.12 or later: `puppeteer-core` 25 is an ES module, which Node.js loads from CommonJS from that version on.

## [0.9.0] - 2026-10-06

### Added

- `cy.getWallet()` yields the wallet under test as a dapp's wallet picker names it: "MetaMask", or "Rabby Wallet" and "Phantom" on their mocks. A spec picks it by that name, and runs as it is on every wallet.

### Fixed

- Commands no longer time out on Chrome for Testing 155 under Linux, where a side panel stays on the wallet's home next to the one showing the request: a side panel on its home screen, as a popup on its home screen, is not taken for the confirmation. The conformance workflow runs the previous Chrome major too, so that a Chrome release fails a job the day it ships.
- The mock no longer asks the user to switch to a chain the wallet does not know: it answers what the wallet was recorded answering, MetaMask's `4902` "Unrecognized chain ID", for the dapp to add the chain, as Privy and others then do. It asks only for the chains the profile saw the wallet ask about. MetaMask's profile records the `4902`, and the conformance suite checks it on every wallet.

## [0.8.0] - 2026-10-06

### Added

- The mock wallet: `mock: 'rabby'`, or `DAPPRESS_MOCK=rabby`, runs the same tests without MetaMask, against a provider in the page that answers as the wallet's profile recorded: identity flags, EIP-6963 announcement, the code and message of each rejection, the constant answers and the errors of the methods the wallet lacks. Anvil holds the keys and signs (`rpcUrl`); each chain holds its state: on a chain the dapp adds, or one named in `chains`, reads go to its RPC and transactions are signed by Anvil and sent there, testnet or fork. A method or an option the profile does not cover fails with `4200` rather than succeed. Profiles of MetaMask, Rabby and Phantom ship with the package; the command log says what the mock answered from the profile.
- `cy.setStorageAt()`, `cy.increaseTime()`, `cy.mine()` and `cy.rpc()` act on the chain the dapp is on: a price, the clock, a balance, on a development node, Anvil or Hardhat, and anything else through `cy.rpc()` on any node. A fork keeps its chain's id, and the mock sends the dapp's requests for that chain to it, with no option to set.

### Changed

- `cy.useNetwork()` that times out says what the dapp heard of its chain meanwhile, in place of the last chain alone.

## [0.7.1] - 2026-10-06

### Changed

- The README says what Dappress is for, that it serves Cypress and only Cypress, how it works, how to run it in CI, and what the wallet profiles are. The browser to install is step 2 of the quick start, since nothing runs without it.

## [0.7.0] - 2026-10-06

### Added

- The MetaMask archive is checked against its SHA-256 before it is unpacked, for the releases `src/config.ts` lists. An archive with another digest is refused and removed. `metamaskChecksum`, or `DAPPRESS_METAMASK_CHECKSUM`, pins the archive of another version; without one, it is loaded as downloaded, with a warning.
- The conformance suite records what the dapp sees of MetaMask, request by request and event by event, as a wallet profile published next to the reports: the first of the profiles a dapp will be tested against. `conformance/recorder.js` records any wallet from a browser console, and `npm run profile` builds a profile from a trace and compares two.

### Changed

- The README's Security section is down to five points. The details, and the way to check each, are in `SECURITY.md`.

## [0.6.1] - 2026-10-05

### Fixed

- `cy.confirmTransaction({ gas })` no longer confirms, now and then, with the fee MetaMask estimated in place of the one asked: the command waits for the "Network fee" row to carry the new fee before confirming, as it did for the spending cap.

## [0.6.0] - 2026-10-05

### Fixed

- The peer dependency on Cypress asks for 15.10 or later, the first version with `Cypress.expose()`, which the commands read their options with. Earlier versions were accepted at install, then failed as soon as the support file loaded.
- A command sent right after another was answered in the popup no longer fails on "Timed out waiting for confirm-footer-button": a decision waits for the popup to close, and a confirmation that closes before it is acted on is looked for again.

## [0.5.1] - 2026-10-05

### Changed

- The README is shorter and keeps to what using Dappress needs. What contributors need moves to `CONTRIBUTING.md`.

## [0.5.0] - 2026-10-03

### Changed

- The sources are in TypeScript. The package ships compiled JavaScript in `dist`, and its type declarations are generated from the code. `dappress` and `dappress/support` are imported as before.
- `cy.useNetwork()` goes on as soon as MetaMask has answered a switch it makes without asking, in place of a fixed pause of 1.5 s, and waits for the provider's `chainChanged` in place of asking for the chain every half second.

### Fixed

- The Transaction Shield offer is closed by its cross when MetaMask is not in English. Its "Learn more" button was pressed instead, which opened a tab over MetaMask's page: the next command timed out.

## [0.4.0] - 2026-10-03

### Added

- `cy.lockWallet()`, `cy.unlockWallet()` and `cy.disconnectFromDapp()`.
- `cy.connectToDapp({ accounts })` chooses the accounts the dapp is connected with.
- `cy.confirmTransaction({ spendingCap, gas })` sets the spending cap of an ERC-20 approval and the network fee before confirming.

## [0.3.3] - 2026-10-03

### Fixed

- MetaMask's extension is looked for again when its page is read while it loads.

## [0.3.2] - 2026-10-03

### Added

- A failed command says what the MetaMask page shows, and what may keep a button disabled.

### Fixed

- A confirmation is scrolled to its end while its button stays disabled.
- An element is taken again before each check and click: MetaMask re-renders its screens.
- MetaMask's popup is given its size back when the window it gets is too small to lay out.
- A modal over the home screen is dismissed before the account list is opened, by its cross first, and the account menu is pressed again when the list doesn't open.
- The browser that builds the cached profile starts without the sandbox on Linux, and keeps MetaMask's page in front.

## [0.3.1] - 2026-10-02

### Added

- Headless runs: Dappress passes MetaMask to Chrome itself, since Cypress leaves extensions out of a headless launch.

## [0.3.0] - 2026-10-02

### Changed

- Without a seed phrase, a new wallet is made for each run.

## [0.2.0] - 2026-10-02

### Added

- `cy.addAccount()`, `cy.importAccount()` and `cy.switchAccount()`.

### Changed

- MetaMask's backup and sync is turned off while the wallet is imported, unless `backupAndSync` is set.

## [0.1.1] - 2026-10-02

### Changed

- The error of a confirmation that stays after its button was pressed says whether it is the same request, and what MetaMask logged.

## [0.1.0] - 2026-10-02

### Added

- MetaMask loaded into the browser Cypress launches, the wallet imported from a seed phrase, and commands to answer a dapp's requests: connection, signatures, transactions, networks and tokens.
- The wallet setup file, `cypress/wallet.setup.ts`, and the opt-in profile cache.
- TypeScript declarations.

[Unreleased]: https://github.com/blassaut/dappress/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/blassaut/dappress/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/blassaut/dappress/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/blassaut/dappress/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/blassaut/dappress/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/blassaut/dappress/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/blassaut/dappress/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/blassaut/dappress/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/blassaut/dappress/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/blassaut/dappress/compare/v0.3.3...v0.4.0
[0.3.3]: https://github.com/blassaut/dappress/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/blassaut/dappress/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/blassaut/dappress/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/blassaut/dappress/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/blassaut/dappress/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/blassaut/dappress/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/blassaut/dappress/releases/tag/v0.1.0
