// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "./interfaces/IVault.sol";

/// @title Storage for Vault
abstract contract VaultStorageV1 {
    /// @notice Redemption state for account
    /// @param pending Pending redemption amount
    /// @param withdrawn Withdrawn redemption amount
    /// @param redemptionQueueTarget Target in vault's redemption queue

    struct Redemption {
        uint256 pending;
        uint256 withdrawn;
        uint256 redemptionQueueTarget;
    }

    /// @notice Asset token
    IERC20Upgradeable internal _asset;

    /// @notice Token decimals;
    uint8 internal _decimals;

    /// @notice Mapping of account to redemption state
    mapping(address => Redemption) internal _redemptions;

    uint256 internal _totalCashBalance;

    uint256 internal _totalWithdrawalBalance;

    /// @notice Realized value
    uint256 public realizedValue;

    /// @notice Pending redemptions
    uint256 public pendingRedemptions;

    /// @notice Current redemption queue (tail)
    uint256 public redemptionQueue;

    /// @notice Processed redemption queue (head)
    uint256 public processedRedemptionQueue;

    /// @notice Mapping of time bucket to pending returns
    mapping(uint256 => uint256) public pendingReturns;
}

/// @title Storage for Vault, aggregated
abstract contract VaultStorage is VaultStorageV1 {

}

/// @title Vault
contract Vault is
    Initializable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    VaultStorage,
    ERC721Holder,
    IVault
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using MathUpgradeable for uint256;

    /////////////////////////////////////////////////////////////////////////
    /// Errors ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Invalid address (e.g. zero address)
    error InvalidAddress();

    /// @notice Parameter out of bounds
    error ParameterOutOfBounds();

    /// @notice Insolvent vault
    error Insolvent();

    /// @notice Insufficient balance
    error InsufficientBalance();

    /// @notice Redemption in progress
    error RedemptionInProgress();

    /// @notice Invalid amount
    error InvalidAmount();

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

        uint8 decimals_;
        try IERC20MetadataUpgradeable(address(asset_)).decimals() returns (
            uint8 value
        ) {
            decimals_ = value;
        } catch {
            decimals_ = super.decimals();

            _asset = asset_;
            _decimals = decimals_;
        }
    }

    /////////////////////////////////////////////////////////////////////////
    /// Getters ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice See {IERC20Metadata-decimals}.
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice See {IERC4626-asset}.
    function asset() public view returns (address) {
        return address(_asset);
    }

    /// @notice See {IERC4626-convertToShares}.
    function convertToShares(uint256 assets)
        public
        view
        returns (uint256 shares)
    {
        return _convertToShares(assets, MathUpgradeable.Rounding.Down);
    }

    /// @notice See {IERC4626-convertToAssets}.
    function convertToAssets(uint256 shares)
        public
        view
        returns (uint256 assets)
    {
        return _convertToAssets(shares, MathUpgradeable.Rounding.Down);
    }

    /// @notice Get redemption state for account
    /// @param account Account
    /// @return Redemption state
    function redemptions(address account)
        external
        view
        returns (Redemption memory)
    {
        return _redemptions[account];
    }

    /// @notice Get amount of redemption available for withdraw for account
    /// @param account Account
    /// @return Amount available for withdraw
    function redemptionAvailable(address account)
        public
        view
        returns (uint256)
    {
        Redemption storage redemption = _redemptions[account];

        if (redemption.pending == 0) {
            // No redemption pending
            return 0;
        } else if (
            processedRedemptionQueue >=
            redemption.redemptionQueueTarget + redemption.pending
        ) {
            // Full redemption available for withdraw
            return redemption.pending - redemption.withdrawn;
        } else if (
            processedRedemptionQueue > redemption.redemptionQueueTarget
        ) {
            // Partial redemption available for withdraw
            return
                processedRedemptionQueue -
                redemption.redemptionQueueTarget -
                redemption.withdrawn;
        } else {
            // No redemption available for withdraw
            return 0;
        }
    }

    /////////////////////////////////////////////////////////////////////////
    /// User Functions ///
    /////////////////////////////////////////////////////////////////////////

    /// @inheritdoc IVault
    function deposit(uint256 assets) external whenNotPaused nonReentrant {
        // Validate amount
        if (assets == 0) revert ParameterOutOfBounds();

        _deposit(assets);

        // Transfer cash from user to vault
        _asset.safeTransferFrom(msg.sender, address(this), assets);
    }

    /// @inheritdoc IVault
    function redeem(uint256 shares) public whenNotPaused nonReentrant {
        // Validate shares
        if (shares == 0) revert ParameterOutOfBounds();

        // Check vault is solvent
        if (!_isSolvent()) revert Insolvent();

        // Compute redemption amount
        uint256 redemptionAmount = convertToAssets(shares);

        // Schedule redemption with user's token state and burn receipt tokens
        _redeem(msg.sender, shares, redemptionAmount, redemptionQueue);

        // Schedule redemption
        pendingRedemptions += redemptionAmount;
        redemptionQueue += redemptionAmount;

        // Process redemptions from undeployed cash
        uint256 immediateRedemptionAmount = Math.min(
            redemptionAmount,
            _totalCashBalance
        );
        _totalCashBalance -= immediateRedemptionAmount;
        _processProceeds(immediateRedemptionAmount);

        emit Redeemed(msg.sender, shares, redemptionAmount);
    }

    /// @inheritdoc IVault
    function withdraw(uint256 maxAssets) public whenNotPaused nonReentrant {
        // Calculate amount available to withdraw
        uint256 assets = Math.min(redemptionAvailable(msg.sender), maxAssets);

        if (assets != 0) {
            // Update user's token state with redemption
            _withdraw(msg.sender, assets);

            // Decrease total withdrawal balance
            _totalWithdrawalBalance -= assets;

            // Transfer cash from vault to user
            _asset.safeTransfer(msg.sender, assets);
        }

        emit Withdrawn(msg.sender, assets);
    }

    /////////////////////////////////////////////////////////////////////////
    /// Internal Helper Functions ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Internal conversion function (from assets to shares) with support for rounding direction.
    function _convertToShares(uint256 assets, MathUpgradeable.Rounding rounding)
        internal
        view
        returns (uint256 shares)
    {
        uint256 supply = totalSupply();
        return
            (assets == 0 || supply == 0)
                ? _initialConvertToShares(assets, rounding)
                : assets.mulDiv(supply, realizedValue, rounding);
    }

    /// @notice Internal conversion function (from assets to shares) to apply when the vault is empty.
    function _initialConvertToShares(
        uint256 assets,
        MathUpgradeable.Rounding /*rounding*/
    ) internal pure returns (uint256 shares) {
        return assets;
    }

    /// @notice Internal conversion function (from shares to assets) with support for rounding direction.
    function _convertToAssets(uint256 shares, MathUpgradeable.Rounding rounding)
        internal
        view
        virtual
        returns (uint256 assets)
    {
        uint256 supply = totalSupply();
        return
            (supply == 0)
                ? _initialConvertToAssets(shares, rounding)
                : shares.mulDiv(realizedValue, supply, rounding);
    }

    /// @notice Internal conversion function (from shares to assets) to apply when the vault is empty.
    function _initialConvertToAssets(
        uint256 shares,
        MathUpgradeable.Rounding /*rounding*/
    ) internal view virtual returns (uint256 assets) {
        return shares;
    }

    /// @notice Get the total loan balance, computed indirectly from vault
    /// realized values and cash balances
    /// @return Total loan balance in UD60x18
    function _totalLoanBalance() internal view returns (uint256) {
        return realizedValue - _totalCashBalance;
    }

    /// @notice Burn tokens from account for redemption
    /// @param account Redeeming account
    /// @param shares Amount of receipt tokens
    /// @param assets Amount of asset tokens
    /// @param redemptionQueueTarget Target in vault's redemption queue
    function _redeem(
        address account,
        uint256 shares,
        uint256 assets,
        uint256 redemptionQueueTarget
    ) internal {
        Redemption storage redemption = _redemptions[account];

        if (balanceOf(account) < shares) revert InsufficientBalance();
        if (redemption.pending != 0) revert RedemptionInProgress();

        redemption.pending = assets;
        redemption.withdrawn = 0;
        redemption.redemptionQueueTarget = redemptionQueueTarget;

        _burn(account, shares);
    }

    /// @notice Update account's redemption state for withdraw
    /// @param account Redeeming account
    /// @param assets Amount of asset tokens
    /// redemption queue
    function _withdraw(address account, uint256 assets) internal {
        Redemption storage redemption = _redemptions[account];

        if (redemptionAvailable(account) < assets) revert InvalidAmount();

        if (redemption.withdrawn + assets == redemption.pending) {
            delete _redemptions[account];
        } else {
            redemption.withdrawn += assets;
        }
    }

    /// @notice Check if a vault is solvent
    /// @return Vault is solvent
    function _isSolvent() internal view returns (bool) {
        return realizedValue > pendingRedemptions || totalSupply() == 0;
    }

    /// @notice Process redemptions for vault
    /// @param proceeds Proceeds in asset tokens
    function _processRedemptions(uint256 proceeds) internal returns (uint256) {
        // Compute maximum redemption possible
        uint256 redemptionAmount = Math.min(
            realizedValue,
            Math.min(pendingRedemptions, proceeds)
        );

        // Update vault redemption state
        pendingRedemptions -= redemptionAmount;
        processedRedemptionQueue += redemptionAmount;
        realizedValue -= redemptionAmount;

        // Add redemption to withdrawal balance
        _totalWithdrawalBalance += redemptionAmount;

        // Return amount of proceeds leftover
        return proceeds - redemptionAmount;
    }

    /// @notice Process new proceeds by applying them to redemptions and undeployed
    /// cash
    /// @param proceeds Proceeds in currency tokens
    function _processProceeds(uint256 proceeds) internal {
        // Process redemptions
        proceeds = _processRedemptions(proceeds);
        // Update undeployed cash balance
        _totalCashBalance += proceeds;
    }

    /// @notice Update vault state with currency deposit and mint receipt tokens to
    /// depositer
    /// @param assets Amount of currency tokens
    function _deposit(uint256 assets) internal {
        // Check vault is solvent
        if (!_isSolvent()) revert Insolvent();

        // Compute shares amount
        uint256 shares = convertToShares(assets);

        // Increase realized value of vault
        realizedValue += assets;

        // Process new proceeds
        _processProceeds(assets);

        // Mint receipt tokens to user
        _mint(msg.sender, shares);

        emit Deposited(msg.sender, assets, shares);
    }
}
