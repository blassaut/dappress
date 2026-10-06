# Changelog

What changes for the users of Dappress, version by version. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/blassaut/dappress/compare/v0.7.0...HEAD
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
