# Dappress conformance

One run of the suite per MetaMask release and mode. A mode is where MetaMask shows the dapp's requests: its side panel, the same without a browser window, or its popup when the wallet comes from the wallet cache.

| MetaMask | Side panel | Headless | Popup | Dappress | Date |
| --- | --- | --- | --- | --- | --- |
| 13.55.0 | ❌ 0/39 | ❌ 0/39 | – | 0.11.0 | 2026-10-30 |
| 13.54.0 | ❌ 37/39 | ❌ 37/39 | ❌ 37/39 | 0.11.0 | 2026-10-27 |
| 13.53.0 | ❌ 35/39 | ❌ 37/39 | ❌ 38/39 | 0.11.0 | 2026-10-19 |
| 13.52.0 | ❌ 38/39 | ❌ 38/39 | ❌ 37/39 | 0.11.0 | 2026-10-14 |
| 13.50.0 | ✅ 28/28 | ✅ 28/28 | ✅ 28/28 | 0.4.0 | 2026-10-03 |
| 13.49.0 | ✅ 28/28 | ✅ 28/28 | ✅ 28/28 | 0.4.0 | 2026-10-03 |

## Actions

One row per action of the suite, one column per MetaMask release. ✅ passed in every mode that ran it, ❌ failed in the modes named, – not in the suite then.

| Action | 13.55.0 | 13.54.0 | 13.53.0 | 13.52.0 | 13.50.0 | 13.49.0 |
| --- | --- | --- | --- | --- | --- | --- |
| injects the provider into the dapp | ❌ Headless, Side panel | ❌ Headless, Popup, Side panel | ❌ Headless, Popup, Side panel | ❌ Headless, Popup, Side panel | ✅ | ✅ |
| rejectConnection | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| connectToDapp, onto the network from the wallet setup | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| wallet_getPermissions, once connected | ❌ Headless, Side panel | ✅ | ✅ | ✅ | – | – |
| wallet_getCapabilities | ❌ Headless, Side panel | ✅ | ✅ | ✅ | – | – |
| wallet_requestPermissions, rejected with rejectConnection | ❌ Headless, Side panel | ✅ | ✅ | ✅ | – | – |
| wallet_requestPermissions, accepted with connectToDapp | ❌ Headless, Side panel | ✅ | ✅ | ✅ | – | – |
| confirmSignature (personal_sign) | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| rejectSignature (personal_sign) | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| rejectSignature (signTypedData_v4) | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| confirmSignature (signTypedData_v4) | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| rejectSignature, then confirmSignature twice, each request sent as the one before settles | ❌ Headless, Side panel | ✅ | ✅ | ✅ | – | – |
| rejectTransaction | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| rejectNewNetwork | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| approveNewNetwork | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| rejectSwitchNetwork | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| approveSwitchNetwork | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| switch to a chain the wallet does not know | ❌ Headless, Side panel | ✅ | ✅ | ✅ | – | – |
| useNetwork, back to a network the dapp is allowed on | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| wallet_sendCalls on a chain without EIP-7702: refused without asking | ❌ Headless, Side panel | ✅ | ✅ | ✅ | – | – |
| confirmTransaction | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| approveAddToken | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| rejectAddToken | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| confirmTransaction (ERC-20 approval) | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| confirmTransaction ({ spendingCap }) | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| confirmTransaction ({ gas }) | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| confirmTransaction ({ spendingCap, gas }) | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| confirmTransaction ({ gas: 'networkSuggested' }) | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| addAccount | ❌ Headless, Side panel | ❌ Side panel | ✅ | ✅ | ✅ | ✅ |
| importAccount | ❌ Headless, Side panel | ❌ Headless | ✅ | ❌ Popup | ✅ | ✅ |
| switchAccount | ❌ Headless, Side panel | ❌ Popup | ❌ Headless | ✅ | ✅ | ✅ |
| connectToDapp ({ accounts }) | ❌ Headless, Side panel | ✅ | ❌ Side panel | ✅ | ✅ | ✅ |
| lockWallet | ❌ Headless, Side panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| unlockWallet | ❌ Headless, Side panel | ✅ | ❌ Side panel | ✅ | ✅ | ✅ |
| disconnectFromDapp | ❌ Headless, Side panel | ✅ | ❌ Side panel | ✅ | ✅ | ✅ |
| chain commands: mine, increaseTime, setStorageAt, rpc | ❌ Headless, Side panel | ✅ | ✅ | ✅ | – | – |
| snapshot, revert right after a transaction: the next one goes from the nonce the chain went back to | ❌ Headless, Side panel | ✅ | ✅ | ✅ | – | – |
| snapshot, revert once the wallet saw the transaction mined: the next one goes from the nonce the chain went back to | ❌ Headless, Side panel | ✅ | ✅ | ✅ | – | – |
| snapshot, revert | ❌ Headless, Side panel | ✅ | ✅ | ✅ | – | – |

## Failures

- 13.55.0, Headless: injects the provider into the dapp: CypressError: `cy.task('dappress:setupMetaMask')` failed with the following error:
- 13.55.0, Headless: rejectConnection
- 13.55.0, Headless: connectToDapp, onto the network from the wallet setup
- 13.55.0, Headless: wallet_getPermissions, once connected
- 13.55.0, Headless: wallet_getCapabilities
- 13.55.0, Headless: wallet_requestPermissions, rejected with rejectConnection
- 13.55.0, Headless: wallet_requestPermissions, accepted with connectToDapp
- 13.55.0, Headless: confirmSignature (personal_sign)
- 13.55.0, Headless: rejectSignature (personal_sign)
- 13.55.0, Headless: rejectSignature (signTypedData_v4)
- 13.55.0, Headless: confirmSignature (signTypedData_v4)
- 13.55.0, Headless: rejectSignature, then confirmSignature twice, each request sent as the one before settles
- 13.55.0, Headless: rejectTransaction
- 13.55.0, Headless: rejectNewNetwork
- 13.55.0, Headless: approveNewNetwork
- 13.55.0, Headless: rejectSwitchNetwork
- 13.55.0, Headless: approveSwitchNetwork
- 13.55.0, Headless: switch to a chain the wallet does not know
- 13.55.0, Headless: useNetwork, back to a network the dapp is allowed on
- 13.55.0, Headless: wallet_sendCalls on a chain without EIP-7702: refused without asking
- 13.55.0, Headless: confirmTransaction
- 13.55.0, Headless: approveAddToken
- 13.55.0, Headless: rejectAddToken
- 13.55.0, Headless: confirmTransaction (ERC-20 approval)
- 13.55.0, Headless: confirmTransaction ({ spendingCap })
- 13.55.0, Headless: confirmTransaction ({ gas })
- 13.55.0, Headless: confirmTransaction ({ spendingCap, gas })
- 13.55.0, Headless: confirmTransaction ({ gas: 'networkSuggested' })
- 13.55.0, Headless: addAccount
- 13.55.0, Headless: importAccount
- 13.55.0, Headless: switchAccount
- 13.55.0, Headless: connectToDapp ({ accounts })
- 13.55.0, Headless: lockWallet
- 13.55.0, Headless: unlockWallet
- 13.55.0, Headless: disconnectFromDapp
- 13.55.0, Headless: chain commands: mine, increaseTime, setStorageAt, rpc
- 13.55.0, Headless: snapshot, revert right after a transaction: the next one goes from the nonce the chain went back to
- 13.55.0, Headless: snapshot, revert once the wallet saw the transaction mined: the next one goes from the nonce the chain went back to
- 13.55.0, Headless: snapshot, revert
- 13.55.0, Side panel: injects the provider into the dapp: CypressError: `cy.task('dappress:setupMetaMask')` failed with the following error:
- 13.55.0, Side panel: rejectConnection
- 13.55.0, Side panel: connectToDapp, onto the network from the wallet setup
- 13.55.0, Side panel: wallet_getPermissions, once connected
- 13.55.0, Side panel: wallet_getCapabilities
- 13.55.0, Side panel: wallet_requestPermissions, rejected with rejectConnection
- 13.55.0, Side panel: wallet_requestPermissions, accepted with connectToDapp
- 13.55.0, Side panel: confirmSignature (personal_sign)
- 13.55.0, Side panel: rejectSignature (personal_sign)
- 13.55.0, Side panel: rejectSignature (signTypedData_v4)
- 13.55.0, Side panel: confirmSignature (signTypedData_v4)
- 13.55.0, Side panel: rejectSignature, then confirmSignature twice, each request sent as the one before settles
- 13.55.0, Side panel: rejectTransaction
- 13.55.0, Side panel: rejectNewNetwork
- 13.55.0, Side panel: approveNewNetwork
- 13.55.0, Side panel: rejectSwitchNetwork
- 13.55.0, Side panel: approveSwitchNetwork
- 13.55.0, Side panel: switch to a chain the wallet does not know
- 13.55.0, Side panel: useNetwork, back to a network the dapp is allowed on
- 13.55.0, Side panel: wallet_sendCalls on a chain without EIP-7702: refused without asking
- 13.55.0, Side panel: confirmTransaction
- 13.55.0, Side panel: approveAddToken
- 13.55.0, Side panel: rejectAddToken
- 13.55.0, Side panel: confirmTransaction (ERC-20 approval)
- 13.55.0, Side panel: confirmTransaction ({ spendingCap })
- 13.55.0, Side panel: confirmTransaction ({ gas })
- 13.55.0, Side panel: confirmTransaction ({ spendingCap, gas })
- 13.55.0, Side panel: confirmTransaction ({ gas: 'networkSuggested' })
- 13.55.0, Side panel: addAccount
- 13.55.0, Side panel: importAccount
- 13.55.0, Side panel: switchAccount
- 13.55.0, Side panel: connectToDapp ({ accounts })
- 13.55.0, Side panel: lockWallet
- 13.55.0, Side panel: unlockWallet
- 13.55.0, Side panel: disconnectFromDapp
- 13.55.0, Side panel: chain commands: mine, increaseTime, setStorageAt, rpc
- 13.55.0, Side panel: snapshot, revert right after a transaction: the next one goes from the nonce the chain went back to
- 13.55.0, Side panel: snapshot, revert once the wallet saw the transaction mined: the next one goes from the nonce the chain went back to
- 13.55.0, Side panel: snapshot, revert
- 13.54.0, Headless: injects the provider into the dapp: TypeError: The following error originated from your application code, not from Cypress. It was caused by an unhandled promise rejection.
- 13.54.0, Headless: importAccount: CypressError: `cy.task('dappress:connectToDapp')` failed with the following error:
- 13.54.0, Popup: injects the provider into the dapp: TypeError: The following error originated from your application code, not from Cypress. It was caused by an unhandled promise rejection.
- 13.54.0, Popup: switchAccount: CypressError: `cy.task('dappress:connectToDapp')` failed with the following error:
- 13.54.0, Side panel: injects the provider into the dapp: TypeError: The following error originated from your application code, not from Cypress. It was caused by an unhandled promise rejection.
- 13.54.0, Side panel: addAccount: CypressError: `cy.task('dappress:connectToDapp')` failed with the following error:
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
