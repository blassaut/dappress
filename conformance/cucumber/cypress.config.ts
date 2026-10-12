import { defineConfig } from 'cypress';
import createBundler from '@bahmutov/cypress-esbuild-preprocessor';
import { addCucumberPreprocessorPlugin } from '@badeball/cypress-cucumber-preprocessor';
import { createEsbuildPlugin } from '@badeball/cypress-cucumber-preprocessor/esbuild';
// The package under test, from its sources
import { chainEvents, configureDappress } from '../../src';

// Dappress beside the Cucumber preprocessor, which needs its own before:run,
// after:run, before:spec and after:spec handlers to write its report
// (.cypress-cucumber-preprocessorrc.json). Run it through
// `npm run conformance:cucumber`, which checks the report.
export default defineConfig({
  e2e: {
    baseUrl: 'https://metamask.github.io/test-dapp/',
    specPattern: 'cypress/e2e/**/*.feature',
    supportFile: 'cypress/support/e2e.ts',
    // As Dappress requires: with it, the run fails on "Failed to connect to MetaMask" before the scenario
    testIsolation: false,
    video: false,
    async setupNodeEvents(cypressOn, config) {
      const on = chainEvents(cypressOn);
      await addCucumberPreprocessorPlugin(on, config);
      on('file:preprocessor', createBundler({ plugins: [createEsbuildPlugin(config)] }));
      // With the cache, Dappress registers a before:run of its own beside the preprocessor's.
      // A headless browser does without the cache all the same, and so does a mock
      return configureDappress(on, config, { cache: true });
    },
  },
});
