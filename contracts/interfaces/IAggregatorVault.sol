// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

/// @title IAggregatorVault
interface IAggregatorVault {
    /// @notice Deposit weth into vault and receive receipt tokens
    /// @param vault Vault address
    /// @param assets The amount of weth being deposited
    /// @return shares The amount of receipt tokens minted
    function deposit(address vault, uint256 assets)
        external
        returns (uint256 shares);

    /// @notice Deposit weth into vault and receive receipt tokens
    /// @param vault Vault address
    /// @param shares The amount of receipt tokens to mint
    /// @return assets The amount of weth deposited
    function mint(address vault, uint256 shares)
        external
        returns (uint256 assets);

    /// @notice Withdraw assets from vault
    /// @param vault Vault address
    /// @param assets The amount of weth being withdrawn
    function withdraw(address vault, uint256 assets)
        external
        returns (uint256 shares);

    /// @notice Redeem assets from vault
    /// @param vault Vault address
    /// @param shares The amount of receipt tokens being burnt
    function redeem(address vault, uint256 shares)
        external
        returns (uint256 assets);
}
