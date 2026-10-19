# Dappress conformance

One run of the suite per MetaMask release and mode. A mode is where MetaMask shows the dapp's requests: its side panel, the same without a browser window, or its popup when the wallet comes from the wallet cache.

| MetaMask | Side panel | Headless | Popup | Dappress | Date |
| --- | --- | --- | --- | --- | --- |
| 13.53.0 | ❌ 35/39 | ❌ 37/39 | ❌ 38/39 | 0.11.0 | 2026-10-19 |
| 13.52.0 | ❌ 38/39 | ❌ 38/39 | ❌ 37/39 | 0.11.0 | 2026-10-14 |
| 13.50.0 | ✅ 28/28 | ✅ 28/28 | ✅ 28/28 | 0.4.0 | 2026-10-03 |
| 13.49.0 | ✅ 28/28 | ✅ 28/28 | ✅ 28/28 | 0.4.0 | 2026-10-03 |

## Actions

One row per action of the suite, one column per MetaMask release. ✅ passed in every mode that ran it, ❌ failed in the modes named, – not in the suite then.

| Action | 13.53.0 | 13.52.0 | 13.50.0 | 13.49.0 |
| --- | --- | --- | --- | --- |
| injects the provider into the dapp | ❌ Headless, Popup, Side panel | ❌ Headless, Popup, Side panel | ✅ | ✅ |
| rejectConnection | ✅ | ✅ | ✅ | ✅ |
| connectToDapp, onto the network from the wallet setup | ✅ | ✅ | ✅ | ✅ |
| wallet_getPermissions, once connected | ✅ | ✅ | – | – |
| wallet_getCapabilities | ✅ | ✅ | – | – |
| wallet_requestPermissions, rejected with rejectConnection | ✅ | ✅ | – | – |
| wallet_requestPermissions, accepted with connectToDapp | ✅ | ✅ | – | – |
| confirmSignature (personal_sign) | ✅ | ✅ | ✅ | ✅ |
| rejectSignature (personal_sign) | ✅ | ✅ | ✅ | ✅ |
| rejectSignature (signTypedData_v4) | ✅ | ✅ | ✅ | ✅ |
| confirmSignature (signTypedData_v4) | ✅ | ✅ | ✅ | ✅ |
| rejectSignature, then confirmSignature twice, each request sent as the one before settles | ✅ | ✅ | – | – |
| rejectTransaction | ✅ | ✅ | ✅ | ✅ |
| rejectNewNetwork | ✅ | ✅ | ✅ | ✅ |
| approveNewNetwork | ✅ | ✅ | ✅ | ✅ |
| rejectSwitchNetwork | ✅ | ✅ | ✅ | ✅ |
| approveSwitchNetwork | ✅ | ✅ | ✅ | ✅ |
| switch to a chain the wallet does not know | ✅ | ✅ | – | – |
| useNetwork, back to a network the dapp is allowed on | ✅ | ✅ | ✅ | ✅ |
| wallet_sendCalls on a chain without EIP-7702: refused without asking | ✅ | ✅ | – | – |
| confirmTransaction | ✅ | ✅ | ✅ | ✅ |
| approveAddToken | ✅ | ✅ | ✅ | ✅ |
| rejectAddToken | ✅ | ✅ | ✅ | ✅ |
| confirmTransaction (ERC-20 approval) | ✅ | ✅ | ✅ | ✅ |
| confirmTransaction ({ spendingCap }) | ✅ | ✅ | ✅ | ✅ |
| confirmTransaction ({ gas }) | ✅ | ✅ | ✅ | ✅ |
| confirmTransaction ({ spendingCap, gas }) | ✅ | ✅ | ✅ | ✅ |
| confirmTransaction ({ gas: 'networkSuggested' }) | ✅ | ✅ | ✅ | ✅ |
| addAccount | ✅ | ✅ | ✅ | ✅ |
| importAccount | ✅ | ❌ Popup | ✅ | ✅ |
| switchAccount | ❌ Headless | ✅ | ✅ | ✅ |
| connectToDapp ({ accounts }) | ❌ Side panel | ✅ | ✅ | ✅ |
| lockWallet | ✅ | ✅ | ✅ | ✅ |
| unlockWallet | ❌ Side panel | ✅ | ✅ | ✅ |
| disconnectFromDapp | ❌ Side panel | ✅ | ✅ | ✅ |
| chain commands: mine, increaseTime, setStorageAt, rpc | ✅ | ✅ | – | – |
| snapshot, revert right after a transaction: the next one goes from the nonce the chain went back to | ✅ | ✅ | – | – |
| snapshot, revert once the wallet saw the transaction mined: the next one goes from the nonce the chain went back to | ✅ | ✅ | – | – |
| snapshot, revert | ✅ | ✅ | – | – |

## Failures

- 13.53.0, Headless: injects the provider into the dapp: TypeError: The following error originated from your application code, not from Cypress. It was caused by an unhandled promise rejection.
- 13.53.0, Headless: switchAccount: CypressError: `cy.task('dappress:connectToDapp')` failed with the following error:
- 13.53.0, Popup: injects the provider into the dapp: TypeError: The following error originated from your application code, not from Cypress. It was caused by an unhandled promise rejection.
- 13.53.0, Side panel: injects the provider into the dapp: TypeError: The following error originated from your application code, not from Cypress. It was caused by an unhandled promise rejection.
- 13.53.0, Side panel: connectToDapp ({ accounts }): CypressError: `cy.task('dappress:connectToDapp')` failed with the following error:
- 13.53.0, Side panel: unlockWallet: CypressError: `cy.task('dappress:confirmSignature')` failed with the following error:
- 13.53.0, Side panel: disconnectFromDapp: CypressError: `cy.task('dappress:disconnectFromDapp')` failed with the following error:
- 13.52.0, Headless: injects the provider into the dapp: TypeError: The following error originated from your application code, not from Cypress. It was caused by an unhandled promise rejection.
- 13.52.0, Popup: injects the provider into the dapp: TypeError: The following error originated from your application code, not from Cypress. It was caused by an unhandled promise rejection.
- 13.52.0, Popup: importAccount: CypressError: `cy.task('dappress:connectToDapp')` failed with the following error:
- 13.52.0, Side panel: injects the provider into the dapp: TypeError: The following error originated from your application code, not from Cypress. It was caused by an unhandled promise rejection.

## Wallets, on the mock

One run of the suite per wallet profile, on the mock wallet that replays it: the commands a dapp can rely on with that wallet. MetaMask's own profile has to pass; what fails on another wallet's is what that wallet does differently.

| Action | MetaMask 13.50.0 | Phantom 26.32.0 | Rabby 0.94.11 |
| --- | --- | --- | --- |
| injects the provider into the dapp | ❌ | ❌ | ❌ |
| rejectConnection | ✅ | ✅ | ✅ |
| connectToDapp, onto the network from the wallet setup | ✅ | ✅ | ✅ |
| wallet_getPermissions, once connected | ✅ | ✅ | ✅ |
| wallet_getCapabilities | ✅ | ✅ | ✅ |
| wallet_requestPermissions, rejected with rejectConnection | ✅ | ✅ | ✅ |
| wallet_requestPermissions, accepted with connectToDapp | ✅ | ✅ | ✅ |
| confirmSignature (personal_sign) | ✅ | ✅ | ✅ |
| rejectSignature (personal_sign) | ✅ | ✅ | ✅ |
| rejectSignature (signTypedData_v4) | ✅ | ✅ | ✅ |
| confirmSignature (signTypedData_v4) | ✅ | ✅ | ✅ |
| rejectSignature, then confirmSignature twice, each request sent as the one before settles | ✅ | ✅ | ✅ |
| rejectTransaction | ✅ | ✅ | ✅ |
| rejectNewNetwork | ✅ | ✅ | ✅ |
| approveNewNetwork | ✅ | ✅ | ✅ |
| rejectSwitchNetwork | ✅ | ✅ | ✅ |
| approveSwitchNetwork | ✅ | ✅ | ✅ |
| switch to a chain the wallet does not know | ✅ | ✅ | ✅ |
| useNetwork, back to a network the dapp is allowed on | ✅ | ✅ | ✅ |
| wallet_sendCalls on a chain without EIP-7702: refused without asking | ✅ | ✅ | ✅ |
| confirmTransaction | ✅ | ✅ | ✅ |
| approveAddToken | ✅ | ✅ | ✅ |
| rejectAddToken | ✅ | ✅ | ✅ |
| confirmTransaction (ERC-20 approval) | ✅ | ✅ | ✅ |
| confirmTransaction ({ spendingCap }) | ✅ | ✅ | ✅ |
| confirmTransaction ({ gas }) | ✅ | ✅ | ✅ |
| confirmTransaction ({ spendingCap, gas }) | ✅ | ✅ | ✅ |
| confirmTransaction ({ gas: 'networkSuggested' }) | ✅ | ✅ | ✅ |
| addAccount | ✅ | ✅ | ✅ |
| importAccount | ✅ | ✅ | ✅ |
| switchAccount | ✅ | ✅ | ✅ |
| connectToDapp ({ accounts }) | ✅ | ✅ | ✅ |
| lockWallet | ✅ | ✅ | ✅ |
| unlockWallet | ✅ | ✅ | ✅ |
| disconnectFromDapp | ✅ | ✅ | ✅ |
| chain commands: mine, increaseTime, setStorageAt, rpc | ✅ | ✅ | ✅ |
| snapshot, revert right after a transaction: the next one goes from the nonce the chain went back to | ✅ | ✅ | ✅ |
| snapshot, revert once the wallet saw the transaction mined: the next one goes from the nonce the chain went back to | ✅ | ✅ | ✅ |
| snapshot, revert | ✅ | ✅ | ✅ |

### What fails, and why

- MetaMask 13.50.0, injects the provider into the dapp: TypeError: The following error originated from your application code, not from Cypress. It was caused by an unhandled promise rejection.
- Phantom 26.32.0, injects the provider into the dapp: TypeError: The following error originated from your application code, not from Cypress. It was caused by an unhandled promise rejection.
- Rabby 0.94.11, injects the provider into the dapp: TypeError: The following error originated from your application code, not from Cypress. It was caused by an unhandled promise rejection.
