# Dappress conformance

One run of the suite per MetaMask release and mode. A mode is where MetaMask shows the dapp's requests: its side panel, the same without a browser window, or its popup when the wallet comes from the profile cache.

| MetaMask | Side panel | Headless | Popup | Dappress | Date |
| --- | --- | --- | --- | --- | --- |
| 13.50.0 | ✅ 28/28 | ✅ 28/28 | ✅ 28/28 | 0.4.0 | 2026-10-03 |
| 13.49.0 | ✅ 28/28 | ✅ 28/28 | ✅ 28/28 | 0.4.0 | 2026-10-03 |

## Actions

One row per action of the suite, one column per MetaMask release. ✅ passed in every mode that ran it, ❌ failed in the modes named, – not in the suite then.

| Action | 13.50.0 | 13.49.0 |
| --- | --- | --- |
| injects the provider into the dapp | ✅ | ✅ |
| rejectConnection | ✅ | ✅ |
| connectToDapp, onto the network from the wallet setup | ✅ | ✅ |
| confirmSignature (personal_sign) | ✅ | ✅ |
| rejectSignature (personal_sign) | ✅ | ✅ |
| rejectSignature (signTypedData_v4) | ✅ | ✅ |
| confirmSignature (signTypedData_v4) | ✅ | ✅ |
| rejectTransaction | ✅ | ✅ |
| rejectNewNetwork | ✅ | ✅ |
| approveNewNetwork | ✅ | ✅ |
| rejectSwitchNetwork | ✅ | ✅ |
| approveSwitchNetwork | ✅ | ✅ |
| useNetwork, back to a network the dapp is allowed on | ✅ | ✅ |
| confirmTransaction | ✅ | ✅ |
| approveAddToken | ✅ | ✅ |
| rejectAddToken | ✅ | ✅ |
| confirmTransaction (ERC-20 approval) | ✅ | ✅ |
| confirmTransaction ({ spendingCap }) | ✅ | ✅ |
| confirmTransaction ({ gas }) | ✅ | ✅ |
| confirmTransaction ({ spendingCap, gas }) | ✅ | ✅ |
| confirmTransaction ({ gas: 'networkSuggested' }) | ✅ | ✅ |
| addAccount | ✅ | ✅ |
| importAccount | ✅ | ✅ |
| switchAccount | ✅ | ✅ |
| connectToDapp ({ accounts }) | ✅ | ✅ |
| lockWallet | ✅ | ✅ |
| unlockWallet | ✅ | ✅ |
| disconnectFromDapp | ✅ | ✅ |
