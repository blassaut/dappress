import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';

Given('the test dapp is open', () => {
  cy.visit('/');
});

When('the dapp asks to connect and the wallet accepts', () => {
  cy.get('#connectButton').click();
  cy.connectToDapp();
});

Then("the dapp is connected with the wallet's account", () => {
  cy.getAccountAddress().then((address) => {
    expect(address).to.match(/^0x[0-9a-f]{40}$/);
    cy.get('#accounts').should('contain.text', address);
  });
});
