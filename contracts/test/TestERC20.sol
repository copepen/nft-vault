// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Test ERC20 Token
contract TestERC20 is ERC20 {
    /////////////////////////////////////////////////////////////////////////
    /// Constructor ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice TestERC20 constructor
    /// @notice name Token name
    /// @notice symbol Token symbol
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    /// @notice Mint token to user
    /// @param user User address
    /// @param amount Mint amount
    function mint(address user, uint256 amount) external {
        return _mint(user, amount);
    }
}
