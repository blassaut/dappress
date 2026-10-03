import { defineConfig } from 'cypress';
import type * as Dappress from '../types';

// The package under test, from its sources
const { configureDappress }: typeof Dappress = require('../src');

// Runs the conformance suite against MetaMask's public test dapp.
// Pick the MetaMask build with DAPPRESS_METAMASK_VERSION=13.50.0.
// scripts/conformance.js sets DAPPRESS_CONFORMANCE_CACHE=1 for the popup mode.
export default defineConfig({
  e2e: {
    baseUrl: 'https://metamask.github.io/test-dapp/',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    // The tests share one MetaMask instance and one dapp connection
    testIsolation: false,
    video: false,
    setupNodeEvents(on, config) {
      return configureDappress(on, config, { cache: process.env.DAPPRESS_CONFORMANCE_CACHE === '1' });
    },
  },
});
