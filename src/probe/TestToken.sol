// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// The probe page's token: enough of ERC-20 for a wallet to watch it and for
/// an approval to go through. Compiled once into src/probe/page/token.ts
/// (CONTRIBUTING.md says how), deployed on the session's Anvil.
contract TestToken {
    string public constant name = "Dappress Probe";
    string public constant symbol = "DPROBE";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(address holder) {
        totalSupply = 1000 ether;
        balanceOf[holder] = totalSupply;
        emit Transfer(address(0), holder, totalSupply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        allowance[from][msg.sender] -= value;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }
}
