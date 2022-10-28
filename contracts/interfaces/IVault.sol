// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/// @title Interface to a Vault
interface IVault {
    /////////////////////////////////////////////////////////////////////////
    /// Events ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Emitted when receipt tokens are redeemed
    /// @param account Redeeming account
    /// @param shares Amount of receipt token burned
    /// @param assets Amount of asset tokens
    event Redeemed(address indexed account, uint256 shares, uint256 assets);

    /// @notice Emitted when redeemed asset tokens are withdrawn
    /// @param account Withdrawing account
    /// @param assets Amount of asset tokens withdrawn
    event Withdrawn(address indexed account, uint256 assets);

    /////////////////////////////////////////////////////////////////////////
    /// User Functions ///
    /////////////////////////////////////////////////////////////////////////
}
