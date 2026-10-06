import '../../../src/support';
import type { TraceChunk } from '../../../scripts/profile';

declare global {
  interface Window {
    __dappressTrace?: TraceChunk;
  }
}

// Record what the dapp sees of MetaMask, for the wallet profile: the recorder
// goes into the page before the dapp loads, and what it caught leaves the page
// after each test, to the task cypress.config.ts registers
Cypress.on('window:before:load', (win) => {
  win.eval(Cypress.expose('recorder') as string);
});

afterEach(() => {
  cy.window({ log: false }).then((win) => {
    const trace = win.__dappressTrace;
    if (!trace) return;
    const chunk: TraceChunk = { ...trace, test: Cypress.currentTest.title, entries: trace.entries.splice(0) };
    cy.task('dappress:trace', chunk, { log: false });
  });
});
