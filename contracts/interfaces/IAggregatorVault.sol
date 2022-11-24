// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

/// @title IAggregatorVault
interface IAggregatorVault {
    /// @notice Transfer vault share tokens
    /// @param vault Vault address
    /// @param to Destination address
    /// @param amount Transfer amount
    /// @return success If success, returns true
    function transfer(
        address vault,
        address to,
        uint256 amount
    ) external returns (bool);

    /// @notice TransferFrom vault share tokens
    /// @param vault Vault address
    /// @param from Source address
    /// @param to Destination address
    /// @param amount Transfer amount
    /// @return success If success, returns true
    function transferFrom(
        address vault,
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    /// @notice Approve vault share tokens
    /// @param vault Vault address
    /// @param spender Spender address
    /// @param amount Amount of tokens to approve
    /// @return success If success, returns true
    function approve(
        address vault,
        address spender,
        uint256 amount
    ) external returns (bool);

    /// @notice Deposit weth into vault and receive receipt tokens
    /// @param vault Vault address
    /// @param assets The amount of weth being deposited
    /// @param receiver The account that will receive the receipt tokens
    /// @return shares The amount of receipt tokens minted
    function deposit(
        address vault,
        uint256 assets,
        address receiver
    ) external returns (uint256 shares);

    /// @notice Deposit weth into vault and receive receipt tokens
    /// @param vault Vault address
    /// @param shares The amount of receipt tokens to mint
    /// @param receiver The account that will receive the receipt tokens
    /// @return assets The amount of weth deposited
    function mint(
        address vault,
        uint256 shares,
        address receiver
    ) external returns (uint256 assets);

    /// @notice Withdraw assets from vault
    /// @param vault Vault address
    /// @param assets The amount of weth being withdrawn
    /// @param receiver The account that will receive weth
    /// @param owner The account that will pay receipt tokens
    function withdraw(
        address vault,
        uint256 assets,
        address receiver,
        address owner
    ) external returns (uint256 shares);

    /// @notice Redeem assets from vault
    /// @param vault Vault address
    /// @param shares The amount of receipt tokens being burnt
    /// @param receiver The account that will receive weth
    /// @param owner The account that will pay receipt tokens
    function redeem(
        address vault,
        uint256 shares,
        address receiver,
        address owner
    ) external returns (uint256 assets);
}
