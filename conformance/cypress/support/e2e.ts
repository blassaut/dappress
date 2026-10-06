import '../../../src/support';
import type { TraceChunk } from '../../../scripts/profile';

declare global {
  interface Window {
    __dappressTrace?: TraceChunk;
  }
}

// Record what the dapp sees of MetaMask, for the wallet profile: the recorder
// goes into the page before the dapp loads, and what it caught leaves the page
// after each test, to the task cypress.config.ts registers. The recording is
// a side channel: whatever goes wrong with it, the test keeps its own result.
Cypress.on('window:before:load', (win) => {
  win.eval(Cypress.expose('recorder') as string);
});

afterEach(() => {
  cy.window({ log: false }).then((win) => {
    const trace = win.__dappressTrace;
    if (!trace) return;
    const entries = trace.entries.splice(0);
    let chunk: TraceChunk;
    try {
      // What the task can carry: a value with a cycle or a BigInt in it cannot leave the page
      chunk = JSON.parse(JSON.stringify({ ...trace, test: Cypress.currentTest.title, entries }));
    } catch (error) {
      Cypress.log({ name: 'dappress', message: `trace of "${Cypress.currentTest.title}" not recorded: ${(error as Error).message}` });
      return;
    }
    cy.task('dappress:trace', chunk, { log: false });
  });
});
