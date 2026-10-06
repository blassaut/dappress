// Where MetaMask shows a dapp's requests depends on how the wallet got into the
// browser. The conformance suite runs in each of these modes.

export const MODES: Record<string, { label: string; headed: boolean; cache: boolean }> = {
  // The wallet is imported in the run, which ends by opening the side panel
  sidepanel: { label: 'Side panel', headed: true, cache: false },
  // The same, without a window: Dappress passes MetaMask to Chrome itself
  headless: { label: 'Headless', headed: false, cache: false },
  // The wallet comes from the wallet cache, the side panel is closed: requests open the popup
  popup: { label: 'Popup', headed: true, cache: true },
};

/** No MetaMask at all: the mock wallet replays a profile, in Cypress's own Electron. Not a column of the matrix. */
export const MOCK_MODE = { label: 'Mock', headed: false, cache: false };

/** The report file for one run of the mock of `wallet`, by the profile's version. */
export function mockReportName(wallet: string, version: string): string {
  return `mock-${wallet.toLowerCase()}-${version}.json`;
}

/** The report file for one MetaMask version in one mode. */
export function reportName(metamaskVersion: string, mode: string): string {
  return `metamask-${metamaskVersion}-${mode}.json`;
}
