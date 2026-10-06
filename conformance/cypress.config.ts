import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'cypress';
// The package under test, from its sources
import { configureDappress } from '../src';

// Runs the conformance suite against MetaMask's public test dapp.
// Pick the MetaMask build with DAPPRESS_METAMASK_VERSION=13.50.0.
// scripts/conformance.ts sets DAPPRESS_CONFORMANCE_CACHE=1 for the popup mode,
// DAPPRESS_TRACE_FILE to where the recorder's trace goes, one test per line, and
// DAPPRESS_CONFORMANCE_WALLET to the wallet it made. Run the suite through it.
export default defineConfig({
  e2e: {
    baseUrl: 'https://metamask.github.io/test-dapp/',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    // The tests share one MetaMask instance and one dapp connection
    testIsolation: false,
    video: false,
    setupNodeEvents(on, config) {
      const traceFile = process.env.DAPPRESS_TRACE_FILE;
      on('task', {
        // A failure here would fail the test and skip the rest of the suite: logged instead
        'dappress:trace': (chunk: unknown) => {
          try {
            if (traceFile) fs.appendFileSync(traceFile, `${JSON.stringify(chunk)}\n`);
          } catch (error) {
            console.warn(`[dappress] trace not recorded: ${(error as Error).message}`);
          }
          return null;
        },
      });
      // The recorder's source, for the support file to run in the page, and the wallet scripts/conformance.ts made
      config.expose = {
        ...config.expose,
        recorder: fs.readFileSync(path.join(__dirname, 'recorder.js'), 'utf8'),
        conformance: JSON.parse(process.env.DAPPRESS_CONFORMANCE_WALLET || 'null'),
      };
      return configureDappress(on, config, { cache: process.env.DAPPRESS_CONFORMANCE_CACHE === '1' });
    },
  },
});
