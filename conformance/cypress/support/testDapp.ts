// Page object for https://metamask.github.io/test-dapp/
export const testDapp = {
  open: () => cy.visit('/'),
  connect: () => cy.get('#connectButton').click(),
  accounts: () => cy.get('#accounts'),
  chainId: () => cy.get('#chainId'),
  personalSign: () => cy.get('#personalSign').click(),
  personalSignResult: () => cy.get('#personalSignResult'),
  signTypedDataV4: () => cy.get('#signTypedDataV4').click(),
  signTypedDataV4Result: () => cy.get('#signTypedDataV4Result'),
  sendEth: () => cy.get('#sendButton').click(),
  createToken: () => cy.get('#createToken').click(),
  tokenAddress: () => cy.get('#erc20TokenAddresses').invoke('text'),
};
