import { defineConfig } from 'cypress';
// The package under test, from its sources
import { configureDappress } from '../src';
import { loadProfile } from '../src/wallet-profile';
import type { PublicOptions } from '../src/types';

// Goes through the probe page with Dappress's commands. `npm run conformance
// -- --probe` builds nothing: run `npm run build` first. It starts Anvil and
// the page, and sets DAPPRESS_PROBE_URL to the page and DAPPRESS_PROBE_REFERENCE
// to the profile the recorded one must agree with: MetaMask's, or the mock's.
export default defineConfig({
  e2e: {
    baseUrl: process.env.DAPPRESS_PROBE_URL,
    specPattern: 'cypress/probe/**/*.cy.ts',
    supportFile: 'cypress/support/probe.ts',
    // One wallet and one page for the whole flow
    testIsolation: false,
    video: false,
    setupNodeEvents(on, config) {
      config.expose = { ...config.expose, probeReference: loadProfile(process.env.DAPPRESS_PROBE_REFERENCE || 'metamask') };
      const dappress = configureDappress(on, config, { chains: { '0x7a69': 'http://127.0.0.1:8545' } });
      // The suite's wallet setup (cypress/wallet.setup.ts, read from this same
      // folder) has cy.connectToDapp() move the dapp onto Hoodi: requests the
      // page never sends, which would land in its trace under the next steps,
      // and a prompt of their own beside the page's. The page alone talks to the wallet
      (dappress.expose.dappress as PublicOptions).network = null;
      return dappress;
    },
  },
});
