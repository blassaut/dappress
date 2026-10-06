import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'cypress';
// The package under test, from its sources
import { configureDappress } from '../src';

// Runs the conformance suite against MetaMask's public test dapp.
// Pick the MetaMask build with DAPPRESS_METAMASK_VERSION=13.50.0.
// scripts/conformance.ts sets DAPPRESS_CONFORMANCE_CACHE=1 for the popup mode,
// and DAPPRESS_TRACE_FILE to where the recorder's trace goes, one test per line.
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
        'dappress:trace': (chunk: unknown) => {
          if (traceFile) fs.appendFileSync(traceFile, `${JSON.stringify(chunk)}\n`);
          return null;
        },
      });
      // The recorder's source, for the support file to run in the page
      config.expose = { ...config.expose, recorder: fs.readFileSync(path.join(__dirname, 'recorder.js'), 'utf8') };
      return configureDappress(on, config, { cache: process.env.DAPPRESS_CONFORMANCE_CACHE === '1' });
    },
  },
});
