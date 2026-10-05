# Security

Dappress reads a seed phrase and drives a wallet. What it does with them, what it talks to and what the package holds are set out in the [Security section of the README](https://github.com/blassaut/dappress#security), with a way to check each point.

## Reporting a vulnerability

Report it privately, with GitHub's [private vulnerability reporting](https://github.com/blassaut/dappress/security/advisories/new): "Report a vulnerability" in the Security tab of the repository. Do not open a public issue, and do not describe it in a pull request. Expect an acknowledgement within a week.

A vulnerability is anything that would:

- let the seed phrase, the password or a private key leave the machine, reach the browser side or appear in a log;
- make the package reach a host other than MetaMask's GitHub releases, or send the wallet a request the README does not list;
- change what the published package holds compared with the build of its tag, through a dependency, a build step or the release workflow.

A flaw in MetaMask itself goes to [MetaMask](https://github.com/MetaMask/metamask-extension/security/policy). A known limit, not a vulnerability: the MetaMask build is downloaded over HTTPS from MetaMask's releases and is not checked against a checksum.

## Supported versions

The latest release. A fix ships as a new version: a version on npm is never changed once published.

## What a release guarantees

- Every version is built and published by [a GitHub Actions workflow](.github/workflows/release.yml) from its tag, as an npm trusted publisher: no npm token exists. The version carries a provenance attestation naming this repository, the workflow, the commit and the run.
- After each release, [another workflow](.github/workflows/reproducible.yml) builds the tag again, compares the result with the tarball npm serves, file by file, and verifies npm's signature and provenance of the version. Its badge is in the README.
