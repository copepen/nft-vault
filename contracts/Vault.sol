// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

import "./interfaces/IVault.sol";

/// @title Storage for Vault
abstract contract VaultStorageV1 {
    /////////////////////////////////////////////////////////////////////////
    /// Structures ///
    /////////////////////////////////////////////////////////////////////////

    /// @dev Asset token
    IERC20Upgradeable internal _asset;

    /// @dev Token decimals;
    uint8 internal _decimals;

    /// @dev Admin fee rate in UD60x18 fraction of interest
    uint256 internal _adminFeeRate;

    uint256 internal _totalAdminFeeBalance;

    /// @notice Total assets value
    uint256 internal _totalAssets;
}

/// @title Storage for Vault, aggregated
abstract contract VaultStorage is VaultStorageV1 {

}

/// @title Vault
contract Vault is
    Initializable,
    ERC20Upgradeable,
    IERC4626Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    VaultStorage,
    ERC721Holder,
    IVault
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using MathUpgradeable for uint256;

    /////////////////////////////////////////////////////////////////////////
    /// Constants ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Implementation version
    string public constant IMPLEMENTATION_VERSION = "1.0";

    /// @notice One in UD60x18
    uint256 private constant ONE_UD60X18 = 1e18;

    /////////////////////////////////////////////////////////////////////////
    /// Access Control Roles ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Keeper role
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    /////////////////////////////////////////////////////////////////////////
    /// Errors ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Invalid address (e.g. zero address)
    error InvalidAddress();

    /// @notice Parameter out of bounds
    error ParameterOutOfBounds();

    /// @notice Insufficient balance
    error InsufficientBalance();

    /////////////////////////////////////////////////////////////////////////
    /// Events ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Emitted when admin fee rate is updated
    /// @param rate New admin fee rate in UD60x18 fraction of interest
    event AdminFeeRateUpdated(uint256 rate);

    /// @notice Emitted when admin fees are withdrawn
    /// @param account Recipient account
    /// @param amount Amount of currency tokens withdrawn
    event AdminFeesWithdrawn(address indexed account, uint256 amount);

    /// @notice Emitted when totalAssets is updated
    /// @param totalAssets Total assets
    event TotalAssets(uint256 totalAssets);

    /////////////////////////////////////////////////////////////////////////
    /// Constructor ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Vault constructor (for proxy)
    /// @param name_ receipt token name
    /// @param symbol_ receipt token symbol
    /// @param asset_ asset token contract
    function initialize(
        string calldata name_,
        string calldata symbol_,
        IERC20Upgradeable asset_
    ) external initializer {
        if (address(asset_) == address(0)) revert InvalidAddress();

        __ERC20_init(name_, symbol_);
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(KEEPER_ROLE, msg.sender);

        uint8 decimals_;
        try IERC20MetadataUpgradeable(address(asset_)).decimals() returns (
            uint8 value
        ) {
            decimals_ = value;
        } catch {
            decimals_ = super.decimals();
        }

        _asset = asset_;
        _decimals = decimals_;
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {}

    /////////////////////////////////////////////////////////////////////////
    /// Getters ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice See {IERC20Metadata-decimals}.
    function decimals()
        public
        view
        override(ERC20Upgradeable, IERC20MetadataUpgradeable)
        returns (uint8)
    {
        return _decimals;
    }

    /// @notice See {IERC4626-asset}.
    function asset() external view returns (address) {
        return address(_asset);
    }

    /// @notice See {IERC4626-totalAssets}
    function totalAssets() public view returns (uint256) {
        return _totalAssets;
    }

    /// @notice See {IERC4626-convertToShares}
    function convertToShares(uint256 assets) external view returns (uint256) {
        return _convertToShares(assets, MathUpgradeable.Rounding.Down);
    }

    /// @notice See {IERC4626-convertToAssets}
    function convertToAssets(uint256 shares) external view returns (uint256) {
        return _convertToAssets(shares, MathUpgradeable.Rounding.Down);
    }

    /// @notice See {IERC4626-maxDeposit}
    function maxDeposit(address) external pure returns (uint256) {
        return type(uint256).max;
    }

    /// @notice See {IERC4626-maxMint}
    function maxMint(address) external pure returns (uint256) {
        return type(uint256).max;
    }

    /// @notice See {IERC4626-maxWithdraw}
    function maxWithdraw(address) external pure returns (uint256) {
        return type(uint256).max;
    }

    /// @notice See {IERC4626-maxRedeem}
    function maxRedeem(address) external pure returns (uint256) {
        return type(uint256).max;
    }

    /// @notice See {IERC4626-previewDeposit}
    function previewDeposit(uint256 assets) public view returns (uint256) {
        return _convertToShares(assets, MathUpgradeable.Rounding.Down);
    }

    /// @notice See {IERC4626-previewMint}
    function previewMint(uint256 shares) public view returns (uint256) {
        return _convertToAssets(shares, MathUpgradeable.Rounding.Up);
    }

    /// @notice See {IERC4626-previewWithdraw}
    function previewWithdraw(uint256 assets) public view returns (uint256) {
        return _convertToShares(assets, MathUpgradeable.Rounding.Up);
    }

    /// @notice See {IERC4626-previewRedeem}
    function previewRedeem(uint256 shares) public view returns (uint256) {
        return _convertToAssets(shares, MathUpgradeable.Rounding.Down);
    }

    /////////////////////////////////////////////////////////////////////////
    /// User Functions ///
    /////////////////////////////////////////////////////////////////////////

    /// See {IERC4626-deposit}.
    function deposit(uint256 assets, address receiver)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        // Validate amount
        if (assets == 0) revert ParameterOutOfBounds();

        /// Compute number of shares to mint from current vault share price
        shares = previewDeposit(assets);

        _deposit(assets, shares, receiver);

        // Transfer cash from user to vault
        _asset.safeTransferFrom(msg.sender, address(this), assets);
    }

    /// See {IERC4626-mint}.
    function mint(uint256 shares, address receiver)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 assets)
    {
        // Validate amount
        if (shares == 0) revert ParameterOutOfBounds();

        /// Compute number of shares to mint from current vault share price
        assets = previewMint(shares);

        _deposit(assets, shares, receiver);

        // Transfer cash from user to vault
        _asset.safeTransferFrom(msg.sender, address(this), assets);
    }

    /// See {IERC4626-redeem}.
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external whenNotPaused nonReentrant returns (uint256 assets) {
        if (receiver == address(0)) revert InvalidAddress();
        if (shares == 0) revert ParameterOutOfBounds();

        // Compute redemption amount
        assets = previewRedeem(shares);

        _withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /// See {IERC4626-withdraw}.
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external whenNotPaused nonReentrant returns (uint256 shares) {
        if (receiver == address(0)) revert InvalidAddress();
        if (assets == 0) revert ParameterOutOfBounds();

        // compute share amount
        shares = previewWithdraw(assets);

        _withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /////////////////////////////////////////////////////////////////////////
    /// Internal Helper Functions ///
    /////////////////////////////////////////////////////////////////////////

    function _convertToShares(uint256 assets, MathUpgradeable.Rounding rounding)
        internal
        view
        returns (uint256 shares)
    {
        uint256 supply = totalSupply();
        return
            (assets == 0 || supply == 0)
                ? assets
                : assets.mulDiv(supply, totalAssets(), rounding);
    }

    function _convertToAssets(uint256 shares, MathUpgradeable.Rounding rounding)
        internal
        view
        returns (uint256 assets)
    {
        uint256 supply = totalSupply();
        return
            (supply == 0)
                ? shares
                : shares.mulDiv(totalAssets(), supply, rounding);
    }

    /// @dev Deposit/mint common workflow.
    function _deposit(
        uint256 assets,
        uint256 shares,
        address receiver
    ) internal {
        // Increase total assets value of vault
        _totalAssets += assets;

        // Mint receipt tokens to receiver
        _mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /// @dev Withdraw/redeem common workflow.
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal {
        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }

        if (_asset.balanceOf(address(this)) < assets)
            revert InsufficientBalance();

        _burn(owner, shares);

        _asset.safeTransfer(receiver, assets);

        uint256 totalAssets_ = _totalAssets;
        totalAssets_ = totalAssets_ < assets ? 0 : totalAssets_ - assets;
        _totalAssets = totalAssets_;

        emit Withdraw(msg.sender, msg.sender, owner, assets, shares);
    }

    /////////////////////////////////////////////////////////////////////////
    /// Setters ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Set the admin fee rate
    ///
    /// Emits a {AdminFeeRateUpdated} event.
    ///
    /// @param rate Rate in UD60x18 fraction of interest
    function setAdminFeeRate(uint256 rate)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (rate == 0 || rate >= ONE_UD60X18) revert ParameterOutOfBounds();
        _adminFeeRate = rate;
        emit AdminFeeRateUpdated(rate);
    }

    /// @notice Set total assets
    ///
    /// Emits a {TotalAssets} event.
    ///
    /// @param totalAssets_ New total assets value
    function setTotalAssets(uint256 totalAssets_)
        external
        onlyRole(KEEPER_ROLE)
    {
        _totalAssets = totalAssets_;

        emit TotalAssets(totalAssets_);
    }

    /// @notice Pause contract
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause contract
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /////////////////////////////////////////////////////////////////////////
    /// Admin Fees API ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Withdraw admin fees
    ///
    /// Emits a {AdminFeesWithdrawn} event.
    ///
    /// @param recipient Recipient account
    /// @param amount Amount to withdraw
    function withdrawAdminFees(address recipient, uint256 amount)
        external
        nonReentrant
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (recipient == address(0)) revert InvalidAddress();
        if (amount > _totalAdminFeeBalance) revert ParameterOutOfBounds();

        // Update admin fees balance
        _totalAdminFeeBalance -= amount;

        // Transfer cash from vault to recipient
        _asset.safeTransfer(recipient, amount);

        emit AdminFeesWithdrawn(recipient, amount);
    }

    /////////////////////////////////////////////////////////////////////////
    /// Admin API ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Approves asset to spender
    /// @param spender Spender address
    /// @param amount Approve amount
    function approveAsset(address spender, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _asset.safeApprove(spender, amount);
    }
}
