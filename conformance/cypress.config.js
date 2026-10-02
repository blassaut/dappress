const { defineConfig } = require('cypress');
const { configureDappress } = require('../src');

// Runs the conformance suite against MetaMask's public test dapp.
// Pick the MetaMask build with DAPPRESS_METAMASK_VERSION=13.49.0.
module.exports = defineConfig({
  e2e: {
    baseUrl: 'https://metamask.github.io/test-dapp/',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    // The tests share one MetaMask instance and one dapp connection
    testIsolation: false,
    video: false,
    chromeWebSecurity: false,
    setupNodeEvents(on, config) {
      return configureDappress(on, config);
    },
  },
});
