# Dappress conformance

One run of the suite per MetaMask release and mode. A mode is where MetaMask shows the dapp's requests: its side panel, the same without a browser window, or its popup when the wallet comes from the profile cache.

| MetaMask | Side panel | Headless | Popup | Dappress | Date |
| --- | --- | --- | --- | --- | --- |
| 13.50.0 | ❌ 0/16 | ✅ 16/16 | ✅ 16/16 | 0.3.2 | 2026-10-03 |
| 13.49.0 | ✅ 11/11 | – | – | 0.1.0 | 2026-10-02 |

## Actions

One row per action of the suite, one column per MetaMask release. ✅ passed in every mode that ran it, ❌ failed in the modes named, – not in the suite then.

| Action | 13.50.0 | 13.49.0 |
| --- | --- | --- |
| injects the provider into the dapp | ❌ Side panel | ✅ |
| connectToDapp, onto the network from the wallet setup | ❌ Side panel | ✅ |
| confirmSignature (personal_sign) | ❌ Side panel | ✅ |
| rejectSignature (signTypedData_v4) | ❌ Side panel | ✅ |
| rejectTransaction | ❌ Side panel | ✅ |
| rejectNewNetwork | ❌ Side panel | ✅ |
| approveNewNetwork | ❌ Side panel | ✅ |
| rejectSwitchNetwork | ❌ Side panel | ✅ |
| approveSwitchNetwork | ❌ Side panel | ✅ |
| useNetwork, back to a network the dapp is allowed on | ❌ Side panel | ✅ |
| confirmTransaction | ❌ Side panel | ✅ |
| approveAddToken | ❌ Side panel | – |
| rejectAddToken | ❌ Side panel | – |
| addAccount | ❌ Side panel | – |
| importAccount | ❌ Side panel | – |
| switchAccount | ❌ Side panel | – |

## Failures

- 13.50.0, Side panel: injects the provider into the dapp: CypressError: `cy.task('dappress:setupWallet')` failed with the following error:
- 13.50.0, Side panel: connectToDapp, onto the network from the wallet setup
- 13.50.0, Side panel: confirmSignature (personal_sign)
- 13.50.0, Side panel: rejectSignature (signTypedData_v4)
- 13.50.0, Side panel: rejectTransaction
- 13.50.0, Side panel: rejectNewNetwork
- 13.50.0, Side panel: approveNewNetwork
- 13.50.0, Side panel: rejectSwitchNetwork
- 13.50.0, Side panel: approveSwitchNetwork
- 13.50.0, Side panel: useNetwork, back to a network the dapp is allowed on
- 13.50.0, Side panel: confirmTransaction
- 13.50.0, Side panel: approveAddToken
- 13.50.0, Side panel: rejectAddToken
- 13.50.0, Side panel: addAccount
- 13.50.0, Side panel: importAccount
- 13.50.0, Side panel: switchAccount
