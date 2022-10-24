// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "prb-math/contracts/PRBMathUD60x18.sol";

import "./interfaces/IVault.sol";

/// @title Storage for Vault
abstract contract VaultStorageV1 {
    /////////////////////////////////////////////////////////////////////////
    /// Structures ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Loan status
    enum LoanStatus {
        Uninitialized,
        Active,
        Liquidated,
        Complete
    }

    /// @notice Loan state
    /// @param status Loan status
    /// @param maturityTimeBucket Maturity time bucket
    /// @param collateralToken Collateral token contract
    /// @param collateralTokenId Collateral token ID
    /// @param purchasePrice Purchase price in currency tokens
    /// @param repayment Repayment in currency tokens
    /// @param returnAmount Senior vault return in currency tokens
    struct Loan {
        LoanStatus status;
        uint64 maturityTimeBucket;
        IERC721 collateralToken;
        uint256 collateralTokenId;
        uint256 purchasePrice;
        uint256 repayment;
        uint256 returnAmount;
    }

    /// @notice Redemption state for account
    /// @param pending Pending redemption amount
    /// @param withdrawn Withdrawn redemption amount
    /// @param redemptionQueueTarget Target in vault's redemption queue
    struct Redemption {
        uint256 pending;
        uint256 withdrawn;
        uint256 redemptionQueueTarget;
    }

    /// @dev Asset token
    IERC20Upgradeable internal _asset;

    /// @dev Token decimals;
    uint8 internal _decimals;

    /// @dev Mapping of note token contract to note adapter
    mapping(address => INoteAdapter) internal _noteAdapters;

    /// @dev Note tokens set
    EnumerableSet.AddressSet internal _noteTokens;

    /// @dev Mapping of note token contract to loan ID to loan
    mapping(address => mapping(uint256 => Loan)) internal _loans;

    /// @dev Mapping of account to redemption state
    mapping(address => Redemption) internal _redemptions;

    /// @dev Admin fee rate in UD60x18 fraction of interest
    uint256 internal _adminFeeRate;

    uint256 internal _totalCashBalance;
    uint256 internal _totalAdminFeeBalance;
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
    using EnumerableSet for EnumerableSet.AddressSet;

    /////////////////////////////////////////////////////////////////////////
    /// Constants ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Time bucket duration in seconds
    uint256 public constant TIME_BUCKET_DURATION = 7 days;

    /// @notice Number of share price proration buckets
    uint256 public constant SHARE_PRICE_PRORATION_BUCKETS = 14;

    /// @notice Total share price proration window in seconds
    uint256 public constant TOTAL_SHARE_PRICE_PRORATION_DURATION =
        TIME_BUCKET_DURATION * SHARE_PRICE_PRORATION_BUCKETS;

    /// @notice One in UD60x18
    uint256 private constant ONE_UD60X18 = 1e18;

    /////////////////////////////////////////////////////////////////////////
    /// Access Control Roles ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Collateral liquidator role
    bytes32 public constant COLLATERAL_LIQUIDATOR_ROLE =
        keccak256("COLLATERAL_LIQUIDATOR");

    /// @notice Emergency administrator role
    bytes32 public constant EMERGENCY_ADMIN_ROLE = keccak256("EMERGENCY_ADMIN");

    /////////////////////////////////////////////////////////////////////////
    /// Errors ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Invalid address (e.g. zero address)
    error InvalidAddress();

    /// @notice Parameter out of bounds
    error ParameterOutOfBounds();

    /// @notice Unsupported note token
    error UnsupportedNoteToken();

    /// @notice Insolvent vault
    error Insolvent();

    /// @notice Insufficient balance
    error InsufficientBalance();

    /// @notice Redemption in progress
    error RedemptionInProgress();

    /// @notice Invalid amount
    error InvalidAmount();

    /// @notice Invalid loan status
    error InvalidLoanStatus();

    /// @notice Loan not repaid
    error LoanNotRepaid();

    /// @notice Loan not expired
    error LoanNotExpired();

    /// @notice Call failed
    error CallFailed();

    /////////////////////////////////////////////////////////////////////////
    /// Events ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Emitted when admin fee rate is updated
    /// @param rate New admin fee rate in UD60x18 fraction of interest
    event AdminFeeRateUpdated(uint256 rate);

    /// @notice Emitted when note adapter is updated
    /// @param noteToken Note token contract
    /// @param noteAdapter Note adapter contract
    event NoteAdapterUpdated(address indexed noteToken, address noteAdapter);

    /// @notice Emitted when admin fees are withdrawn
    /// @param account Recipient account
    /// @param amount Amount of currency tokens withdrawn
    event AdminFeesWithdrawn(address indexed account, uint256 amount);

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
        _grantRole(EMERGENCY_ADMIN_ROLE, msg.sender);

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

        // Compute current redemption share price
        uint256 currentRedemptionSharePrice = _computeRedemptionSharePrice();

        // Compute redemption amount
        uint256 redemptionAmount = PRBMathUD60x18.mul(
            shares,
            currentRedemptionSharePrice
        );

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
    /// Callbacks ///
    /////////////////////////////////////////////////////////////////////////

    /// @inheritdoc ILoanReceiver
    function onLoanRepaid(address noteToken, uint256 loanId)
        public
        nonReentrant
    {
        // Lookup note adapter
        INoteAdapter noteAdapter = _getNoteAdapter(noteToken);

        // Lookup loan state
        Loan storage loan = _loans[noteToken][loanId];

        // Validate loan is active
        if (loan.status != LoanStatus.Active) revert InvalidLoanStatus();

        // Validate loan was repaid
        if (!noteAdapter.isRepaid(loanId)) revert LoanNotRepaid();

        // Calculate vault returns
        uint256 returnAmount = loan.returnAmount;

        // Unschedule pending returns
        pendingReturns[loan.maturityTimeBucket] -= returnAmount;

        // Calculate and apply admin fee
        returnAmount -= PRBMathUD60x18.mul(_adminFeeRate, returnAmount);
        uint256 adminFee = loan.repayment - loan.purchasePrice - returnAmount;

        // Increase admin fee balance
        _totalAdminFeeBalance += adminFee;

        // Increase vault realized values
        realizedValue += returnAmount;

        // Process new proceeds
        _processProceeds(loan.repayment - adminFee);

        // Mark loan complete
        loan.status = LoanStatus.Complete;

        emit LoanRepaid(noteToken, loanId, adminFee, returnAmount);
    }

    /// @inheritdoc ILoanReceiver
    function onLoanExpired(address noteToken, uint256 loanId)
        public
        nonReentrant
    {
        // Lookup note adapter
        INoteAdapter noteAdapter = _getNoteAdapter(noteToken);

        // Lookup loan state
        Loan storage loan = _loans[noteToken][loanId];

        // Validate loan is active
        if (loan.status != LoanStatus.Active) revert InvalidLoanStatus();

        // Validate loan is not repaid and expired
        if (noteAdapter.isRepaid(loanId) || !noteAdapter.isExpired(loanId))
            revert LoanNotExpired();

        // Calculate vault returns
        uint256 returnAmount = loan.returnAmount;

        // Unschedule pending returns
        pendingReturns[loan.maturityTimeBucket] -= returnAmount;

        // Compute vault losses
        uint256 lossAmount = loan.purchasePrice;

        // Decrease vault realized values
        realizedValue -= lossAmount;

        // Update senior vault return for collateral liquidation
        loan.returnAmount += lossAmount;

        // Mark loan liquidated in loan state
        loan.status = LoanStatus.Liquidated;

        // Get liquidate target and calldata
        (address target, bytes memory data) = noteAdapter.getLiquidateCalldata(
            loanId
        );
        if (target == address(0x0)) revert InvalidAddress();

        // Call liquidate on lending platform
        (bool success, ) = target.call(data);
        if (!success) revert CallFailed();

        emit LoanLiquidated(noteToken, loanId, lossAmount);
    }

    /////////////////////////////////////////////////////////////////////////
    /// Internal Helper Functions ///
    /////////////////////////////////////////////////////////////////////////

    /// @dev Get the total loan balance, computed indirectly from vault
    /// realized values and cash balances
    /// @return Total loan balance in UD60x18
    function _totalLoanBalance() internal view returns (uint256) {
        return realizedValue - _totalCashBalance;
    }

    /// @dev Get and validate the note adapter for a note token
    function _getNoteAdapter(address noteToken)
        internal
        view
        returns (INoteAdapter)
    {
        INoteAdapter noteAdapter = _noteAdapters[noteToken];

        // Validate note token is supported
        if (noteAdapter == INoteAdapter(address(0x0)))
            revert UnsupportedNoteToken();

        return noteAdapter;
    }

    /// @dev Convert Unix timestamp to time bucket
    function _timestampToTimeBucket(uint256 timestamp)
        internal
        pure
        returns (uint256)
    {
        return timestamp / TIME_BUCKET_DURATION;
    }

    /// @dev Convert time bucket to Unix timestamp
    function _timeBucketToTimestamp(uint256 timeBucket)
        internal
        pure
        returns (uint256)
    {
        return timeBucket * TIME_BUCKET_DURATION;
    }

    /// @dev Compute solvent value of the vault
    /// @return Solvent value in currency tokens
    function _computeSolventValue() internal view returns (uint256) {
        return
            realizedValue > pendingRedemptions
                ? realizedValue - pendingRedemptions
                : 0;
    }

    /// @dev Compute estimated value of the vault, including prorated pending
    /// returns
    /// @return Estimated value in currency tokens
    function _computeEstimatedValue() internal view returns (uint256) {
        // Get the current time bucket
        uint256 currentTimeBucket = _timestampToTimeBucket(block.timestamp);

        // Compute elapsed time into current time bucket and convert to UD60x18
        uint256 elapsedTimeIntoBucket = PRBMathUD60x18.fromUint(
            block.timestamp - _timeBucketToTimestamp(currentTimeBucket)
        );

        // Sum the prorated returns from pending returns in each time bucket
        uint256 proratedReturns;
        for (uint256 i; i < SHARE_PRICE_PRORATION_BUCKETS; ++i) {
            // Prorated Returns[i] = ((Elapsed Time + W * (N - 1 - i)) / (W * N)) * Pending Returns[i]
            proratedReturns += PRBMathUD60x18.div(
                PRBMathUD60x18.mul(
                    elapsedTimeIntoBucket +
                        PRBMathUD60x18.fromUint(
                            TIME_BUCKET_DURATION *
                                (SHARE_PRICE_PRORATION_BUCKETS - 1 - i)
                        ),
                    pendingReturns[currentTimeBucket + i]
                ),
                PRBMathUD60x18.fromUint(TOTAL_SHARE_PRICE_PRORATION_DURATION)
            );
        }

        // Return the realized value plus prorated returns
        return _computeSolventValue() + proratedReturns;
    }

    /// @dev Burn tokens from account for redemption
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

    /// @dev Update account's redemption state for withdraw
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

    /// @dev Check if a vault is solvent
    /// @return Vault is solvent
    function _isSolvent() internal view returns (bool) {
        return realizedValue > pendingRedemptions || totalSupply() == 0;
    }

    /// @dev Compute share price of vault including prorated pending returns
    /// @return Share price in UD60x18
    function _computeSharePrice() internal view returns (uint256) {
        uint256 totalSupply = totalSupply();
        if (totalSupply == 0) {
            return ONE_UD60X18;
        }
        return PRBMathUD60x18.div(_computeEstimatedValue(), totalSupply);
    }

    /// @dev Compute redemption share price of vault
    /// @return Redemption share price in UD60x18
    function _computeRedemptionSharePrice() internal view returns (uint256) {
        uint256 totalSupply = totalSupply();
        if (totalSupply == 0) {
            return ONE_UD60X18;
        }
        return PRBMathUD60x18.div(_computeSolventValue(), totalSupply);
    }

    /// @dev Process redemptions for vault
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

    /// @dev Process new proceeds by applying them to redemptions and undeployed
    /// cash
    /// @param proceeds Proceeds in currency tokens
    function _processProceeds(uint256 proceeds) internal {
        // Process redemptions
        proceeds = _processRedemptions(proceeds);
        // Update undeployed cash balance
        _totalCashBalance += proceeds;
    }

    /// @dev Update vault state with currency deposit and mint receipt tokens to
    /// depositer
    /// @param assets Amount of currency tokens
    function _deposit(uint256 assets) internal {
        // Check vault is solvent
        if (!_isSolvent()) revert Insolvent();

        /// Compute current share price
        uint256 currentSharePrice = _computeSharePrice();

        /// Compute number of shares to mint from current vault share price
        uint256 shares = PRBMathUD60x18.div(assets, currentSharePrice);

        // Increase realized value of vault
        realizedValue += assets;

        // Process new proceeds
        _processProceeds(assets);

        // Mint receipt tokens to user
        _mint(msg.sender, shares);

        emit Deposited(msg.sender, assets, shares);
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

    /// @notice Set note adapter contract
    ///
    /// Emits a {NoteAdapterUpdated} event.
    ///
    /// @param noteToken Note token contract
    /// @param noteAdapter Note adapter contract
    function setNoteAdapter(address noteToken, address noteAdapter)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (noteToken == address(0)) revert InvalidAddress();
        _noteAdapters[noteToken] = INoteAdapter(noteAdapter);
        if (noteAdapter != address(0)) {
            _noteTokens.add(noteToken);
        } else {
            _noteTokens.remove(noteToken);
        }
        emit NoteAdapterUpdated(noteToken, noteAdapter);
    }

    /// @notice Pause contract
    function pause() external onlyRole(EMERGENCY_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause contract
    function unpause() external onlyRole(EMERGENCY_ADMIN_ROLE) {
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
}
