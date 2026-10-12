import { outcomeSet, type Profile } from '../../../src/profile-build';

// The probe page, gone through as a user would: each request sent with the
// page's button, and Dappress's commands answering each prompt the page asks
// to accept or reject.
// The profile it builds must answer as the one the suite recorded for this
// wallet: every outcome the page saw is one the reference holds, method by
// method.

const reference = Cypress.expose('probeReference') as Profile;

type Decision = 'connection' | 'signature' | 'transaction' | 'network' | 'switch' | 'token';
const commands: Record<Decision, { accept: () => void; reject: () => void }> = {
  connection: { accept: () => cy.connectToDapp(), reject: () => cy.rejectConnection() },
  signature: { accept: () => cy.confirmSignature(), reject: () => cy.rejectSignature() },
  transaction: { accept: () => cy.confirmTransaction(), reject: () => cy.rejectTransaction() },
  network: { accept: () => cy.approveNewNetwork(), reject: () => cy.rejectNewNetwork() },
  switch: { accept: () => cy.approveSwitchNetwork(), reject: () => cy.rejectSwitchNetwork() },
  token: { accept: () => cy.approveAddToken(), reject: () => cy.rejectAddToken() },
};

// Go through the page's steps until it has finished: send each request the
// page waits to send (ready), then answer its prompt (waiting). The page
// stays in a state until it moves on, so what was done is remembered as the
// state and the request (data-attempt) it was done on, and not done twice.
function goThrough(left: number, done = ''): void {
  const now = ($probe: JQuery) => `${$probe.attr('data-state')}:${$probe.attr('data-attempt') ?? ''}`;
  cy.get('#probe', { timeout: 60000 })
    .should(($probe) => {
      expect($probe.attr('data-state')).to.be.oneOf(['ready', 'waiting', 'finished', 'not-as-asked', 'failed']);
      expect(now($probe), 'a step already done').not.to.eq(done);
    })
    .then(($probe) => {
      const state = $probe.attr('data-state');
      if (state === 'finished') return;
      if (state === 'not-as-asked' || state === 'failed') throw new Error(`The probe page is ${state}: ${Cypress.$('#mismatch, #failure').text()}`);
      if (left === 0) throw new Error('The probe page asked for more than its steps do');
      if (state === 'ready') {
        cy.get('#send').click();
      } else {
        const decision = $probe.attr('data-decision') as Decision;
        const expected = $probe.attr('data-expect') as 'accept' | 'reject';
        commands[decision][expected]();
      }
      goThrough(left - 1, now($probe));
    });
}

// The keys of a result's shape: `result {0x1, 0xaa36a7}`
const keysOf = (outcome: string) =>
  outcome
    .match(/^result \{(.*)\}$/)?.[1]
    .split(', ')
    .filter(Boolean);

/**
 * The probe's config sets the wallet setup's network to null, so the real
 * MetaMask here has fewer chains than in the suite, whose connection adds
 * Hoodi, and it names fewer chains in its capabilities. A result whose chains
 * are among those of a result the reference holds is the same answer, on a
 * wallet with fewer chains. An empty result is accepted too, though the
 * outcome strings do not say whether the request named chains the wallet has
 * no capability on, which is the only case where it is right.
 */
function fewerChains(outcome: string, recorded: string[]): boolean {
  const chains = keysOf(outcome);
  return Boolean(
    chains &&
    recorded.some((known) => {
      const knownChains = keysOf(known);
      return knownChains && chains.every((chain) => knownChains.includes(chain));
    }),
  );
}

/** The outcomes of the recorded profile that the reference does not account for, as `method: outcome`. */
function strays(profile: Profile): string[] {
  return Object.entries(profile.methods).flatMap(([method, observations]) => {
    const recorded = outcomeSet(reference.methods[method]);
    return outcomeSet(observations)
      .filter((outcome) => !recorded.includes(outcome))
      .filter((outcome) => !(method === 'wallet_getCapabilities' && fewerChains(outcome, recorded)))
      .map((outcome) => `${method}: ${outcome}`);
  });
}

describe('The probe page', () => {
  it('records a profile that answers as the reference, step by step', () => {
    cy.visit('/');
    cy.get('#wallets input[type=radio]').first().check();
    cy.get('#version').type(reference.wallet.version);
    cy.get('#start').click();
    // A send and an answer for each step at most
    goThrough(60);
    cy.get('#download').should('be.visible');
    // A step skipped records nothing, and would hide a broken one: the account or the token not found
    cy.get('#steps li').then(($items) => {
      const skipped = [...$items].filter((item) => item.dataset.verdict === 'skipped').map((item) => item.textContent);
      expect(skipped, 'steps skipped').to.deep.equal([]);
    });
    cy.window()
      .its('dappressProbe.profile')
      .then((profile: Profile) => {
        expect(profile.wallet.version).to.eq(reference.wallet.version);
        expect(strays(profile), 'outcomes the reference never recorded').to.deep.equal([]);
      });
  });
});
