Feature: Dappress beside the Cucumber preprocessor

  Scenario: The dapp connects to the wallet
    Given the test dapp is open
    When the dapp asks to connect and the wallet accepts
    Then the dapp is connected with the wallet's account
