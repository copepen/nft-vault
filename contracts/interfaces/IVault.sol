// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Interface to a Vault
interface IVault {
    /////////////////////////////////////////////////////////////////////////
    /// Events ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Emitted when asset is deposited
    /// @param account Depositing account
    /// @param assets Amount of asset tokens
    /// @param shares Amount of receipt tokens minted
    event Deposited(address indexed account, uint256 assets, uint256 shares);

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

    /// @notice Deposit asset into a vault in exchange for receipt tokens
    ///
    /// Emits a {Deposited} event.
    ///
    /// @param assets Amount of asset tokens
    function deposit(uint256 assets) external;

    /// @notice Redeem receipt tokens in exchange for asset tokens. Asset
    /// tokens can be withdrawn with the `withdraw()` method, once the
    /// redemption is processed.
    ///
    /// Emits a {Redeemed} event.
    ///
    /// @param shares Amount of receipt tokens
    function redeem(uint256 shares) external;

    /// @notice Withdraw redeemed asset tokens
    ///
    /// Emits a {Withdrawn} event.
    ///
    /// @param maxAssets Maximum amount of asset tokens to withdraw
    function withdraw(uint256 maxAssets) external;
}
