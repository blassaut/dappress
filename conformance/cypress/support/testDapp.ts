// Page object for https://metamask.github.io/test-dapp/
export const testDapp = {
  open: () => cy.visit('/'),
  connect: () => cy.get('#connectButton').click(),
  connectButton: () => cy.get('#connectButton'),
  accounts: () => cy.get('#accounts'),
  chainId: () => cy.get('#chainId'),
  personalSign: () => cy.get('#personalSign').click(),
  personalSignButton: () => cy.get('#personalSign'),
  personalSignResult: () => cy.get('#personalSignResult'),
  signTypedDataV4: () => cy.get('#signTypedDataV4').click(),
  signTypedDataV4Result: () => cy.get('#signTypedDataV4Result'),
  sendEth: () => cy.get('#sendButton').click(),
  createToken: () => cy.get('#createToken').click(),
  tokenAddress: () => cy.get('#erc20TokenAddresses').invoke('text'),
  approveTokens: () => cy.get('#approveTokens').click(),
  // The address "Approve Tokens" lets spend the token
  approveSpender: () => cy.get('#approveTo').invoke('val').then(String),
};
