# Probe page: record a wallet profile in a few clicks

Status: design approved on 2026-10-12, before the implementation plan.

## Goal

Anyone who uses Dappress can record the profile of a wallet, from its real extension, in their own browser, with one command and a guided page. The profile is then usable at once as a mock (`mock: './rabby-0.95.0.json'`) and can be proposed to the repository, under `reports/profiles/`.

Today, recording means opening MetaMask's test dapp, pasting `conformance/recorder.js` in the console, clicking through the list of `conformance/cypress/e2e/actions.cy.ts` by hand, copying `window.__dappressTrace`, then running `npm run profile -- build`. Only someone who knows the repository does it, and the Rabby and Phantom profiles have not been refreshed since.

Recorded profiles are what Dappress has that others do not. The page is how the set of profiles grows and stays fresh without resting on one person.

## Decisions

| Question | Decision |
|---|---|
| Who records | Any Dappress user, from the published package (`npx dappress probe`), and contributors from a clone |
| Where transactions go | A local Anvil the command starts: no real funds, nothing leaves the machine, the same chain as the conformance suite |
| How the user is guided | A step-by-step flow: the page sends each request and says what to do in the wallet |
| Architecture | Everything in the page, served by a read-only local server; the page builds the profile and offers it as a download |

Rejected: a server that receives the trace and writes the profile (a write endpoint on localhost, which another tab could call), and a flow driven by Cypress (a fresh browser, without the user's extensions).

## 1. The command: `npx dappress probe`

- **Entry point.** `package.json` gets a `bin`, `dappress`, pointing to `dist/cli.js`. One subcommand for now, `probe`. Without one, or with an unknown one, the command prints its usage and exits with 1.
- **Anvil.**
  - The command starts its own Anvil on `127.0.0.1:8545`, the conformance suite's port, so that the recorded chain is the suite's (`0x7a69`).
  - It never reuses a node already listening there, which may be the user's own development node, with its state. If the port is taken, it stops with "Something already listens on 127.0.0.1:8545: stop it, or pass --anvil-port".
  - If `anvil` is not on the `PATH`, it stops with the command that installs Foundry.
  - Anvil is stopped when the command stops, by Ctrl+C or otherwise.
- **The page's server.**
  - `node:http`, bound to `127.0.0.1` only, on a free port picked at each start. Each session then has a new origin, where the wallet holds no permission from a previous one, which would skew the connection steps.
  - It answers `GET` and `HEAD` only, and only for a fixed list of files under `dist/probe/`, plus the shipped MetaMask profile used for the comparison. No directory listing, and no path built from the request: the request path is looked up in the list, nothing else.
  - It refuses with 403 any request whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>`, against a site pointing its own name at the machine (DNS rebinding).
  - It sends a strict Content Security Policy: scripts from the page's origin only, no inline script, connections to the page's origin and to Anvil only. Also `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- **Output.** The command prints the URL to open in the browser where the wallet is installed, and a reminder: use a test wallet, as the profile holds its addresses and signatures.
- **Network.** Nothing but the loopback. No new runtime dependency.

## 2. The page and its flow

- **Load order.** `recorder.js` is the page's first script, before anything else, as in the conformance suite, so that it sees each provider as it turns up.
- **Choosing the wallet.**
  - The page lists the wallets announced through EIP-6963 (name, icon) and the identity flags of `window.ethereum`. The user picks the wallet to record, and every request goes through its provider.
  - When other wallets are active and `window.ethereum` belongs to one of them, the page warns that the profile's identity flags would be wrong. It advises disabling the other extensions, or going on, in which case the profile says so (`recorded.otherWallets`).
  - The name comes from the EIP-6963 announcement. The version is asked of the user, as no wallet gives it to the page; the page says where wallets show it. It must look like a version (`1.2.3`, digits and dots).
- **The flow** follows `actions.cy.ts`, in the same order, so that profiles compare request by request. It leaves out what only tests Dappress's commands: the spending cap and gas options, adding, importing and switching accounts, locking.
  1. Connection rejected, then accepted.
  2. `wallet_getPermissions`; `wallet_getCapabilities`, for all chains, for some, and for an account not connected.
  3. `wallet_requestPermissions` rejected, then accepted.
  4. `personal_sign` accepted, then rejected; `eth_signTypedData_v4` rejected, then accepted.
  5. A transfer rejected.
  6. A chain added and rejected (an unreachable one), then Anvil added and accepted.
  7. A switch to Sepolia rejected, then accepted; a switch to a chain the wallet does not know; back to Anvil.
  8. `wallet_sendCalls` on Anvil.
  9. A transfer accepted.
  10. `wallet_watchAsset` accepted, then rejected; an ERC-20 approval accepted.
  11. `wallet_revokePermissions`, then `wallet_getPermissions`.
- **A step.**
  - It says what to do ("Reject in your wallet", "Accept in your wallet"), sends the request, and shows the outcome: the result, or the code and message of the error.
  - A request the wallet settles without asking is noted as such, and the flow moves on.
  - When the outcome is not the one asked for, an acceptance where a rejection was asked, the step says so and offers to do it again. Everything stays in the trace: it is what the wallet did.
  - "Skip" moves on when the wallet does not answer.
  - No time limit: the user sets the pace.
- **Funds.** Before the transfers, the page credits the connected account on Anvil (`anvil_setBalance`) and deploys a test ERC-20 token, straight to Anvil, not through the wallet. The token is a minimal contract, its source versioned next to its bytecode.
- **The end.**
  - The page summarises the profile (methods, events) and shows its differences with the shipped MetaMask profile, from `diffProfiles`.
  - "Download" saves `<wallet>-<version>.json`, built in the page.
  - The page then says how to use it as a mock, and how to propose it in a pull request to `reports/profiles/`.
- **Reload.** A reload loses the session: the page asks before leaving one in progress.

## 3. Profile, security, build

- **One profile code.** `buildProfile`, `diffProfiles` and their helpers move from `scripts/profile.ts` to `src/profile-build.ts`: pure functions, with no file access. The conformance suite, `npm run profile` and the page use them. `scripts/profile.ts` keeps its command line and the reading of trace files.
- **What the profile says of itself.** `recorded.by` is `dappress probe <version>`, with the date, the browser's user agent and the recorder's version, and `otherWallets: true` when other wallets were active. The schema stays `dappress-wallet-profile/0`: the new field is optional.
- **Secrets.** The page never asks for a seed phrase or a key: the wallet keeps them. The profile does hold the addresses and the signatures of the wallet used. The page says so before the flow starts and at the download: use a test wallet, this file is meant to be shared.
- **What leaves the machine: nothing.**
  - The page loads nothing from elsewhere: no font, no CDN. It talks only to its server and to Anvil, which its CSP enforces.
  - The download is a file made in the browser; nothing is sent.
  - The server is the one of section 1: loopback, read only, fixed file list, `Host` checked.
- **Build.**
  - The page's script is TypeScript, bundled into one file, `dist/probe/probe.js`, by esbuild, a development dependency only. The package keeps its four runtime dependencies.
  - `recorder.js` is copied as is. The page's HTML and CSS are static.
  - The build must stay deterministic, as the reproducible build compares `dist` with what npm serves, file by file: esbuild's version is pinned, and CI builds twice and compares.
- **Documentation.**
  - README: "Record a wallet: `npx dappress probe`", in place of the console recipe.
  - CONTRIBUTING: how to propose a profile.
  - SECURITY.md: the local server, what it serves and what it refuses; the bundled page and what it talks to.
  - CHANGELOG: under Added.

## 4. Tests

- **Unit tests** (`node:test`, as the rest of the repository):
  - **The server.**
    - The listed files are served.
    - Anything else gets 404, path traversal included (`/../`, encoded or not).
    - `POST` and other methods get 405, a foreign `Host` 403.
    - The security headers are there, and the server listens on `127.0.0.1` only.
  - **The command.**
    - Usage without a subcommand.
    - The message when Anvil is missing, and when its port is taken.
    - Anvil stopped when the command stops.
  - **The flow engine.** The steps and the classification of an outcome (rejected, accepted, settled without asking, not the one asked for) are a pure module, tested with a fake provider.
  - **The profile code.** Its tests move with it to `src/`.
- **End to end, in CI.** A Cypress spec of the conformance suite opens the probe page and goes through it with Dappress's commands. When the page says reject, `cy.rejectConnection()`, `cy.rejectSignature()` and the like answer; when it says accept, `cy.connectToDapp()`, `cy.confirmSignature()` and the like.
  - **On the real MetaMask**, the profile the page builds must answer, method by method, as the one the suite records. This proves that a profile recorded with the page compares with the conformance ones.
  - **On the mocks of Rabby and Phantom**, the page must find the profiles they replay: recording and replaying close the loop, and a broken step shows at once.
- **Deterministic build.** CI builds twice and compares `dist`.
- **By hand, by Benjamin,** once the rest passes: Rabby and Phantom recorded with the page, in a browser where they are installed. It is the first real use, and it refreshes their profiles, which date from the console recordings of October 6.

## Out of scope

- Wallets reached through WalletConnect, wallet SDKs or embedded wallets: the page records injected wallets, as the recorder does.
- Recording a wallet's screens: a profile is what the dapp sees.
- Uploading a profile anywhere: the user downloads it and decides.
- A batch MetaMask would send (`wallet_sendCalls` accepted): the flow records what the wallet answers on Anvil, which for MetaMask is the refusal `5710`.
