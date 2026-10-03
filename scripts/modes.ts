// Where MetaMask shows a dapp's requests depends on how the wallet got into the
// browser. The conformance suite runs in each of these modes.

export const MODES: Record<string, { label: string; headed: boolean; cache: boolean }> = {
  // The wallet is imported in the run, which ends by opening the side panel
  sidepanel: { label: 'Side panel', headed: true, cache: false },
  // The same, without a window: Dappress passes MetaMask to Chrome itself
  headless: { label: 'Headless', headed: false, cache: false },
  // The wallet comes from the profile cache, the side panel is closed: requests open the popup
  popup: { label: 'Popup', headed: true, cache: true },
};

/** The report file for one MetaMask version in one mode. */
export function reportName(metamaskVersion: string, mode: string): string {
  return `metamask-${metamaskVersion}-${mode}.json`;
}
