// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "prb-math/contracts/PRBMathUD60x18.sol";

import "../interfaces/IVault.sol";
import "../interfaces/INoteAdapter.sol";

/**
 * @title Storage for Vault
 * @author Spice Finance Inc
 */
abstract contract VaultStorageV1 {
    /**************/
    /* Structures */
    /**************/

    /// @notice Loan status
    enum LoanStatus {
        Uninitialized,
        Active,
        Liquidated,
        Complete
    }

    /// @notice Loan state
    /// @param status Loan status
    /// @param maturity Maturity in seconds since Unix epoch
    /// @param duration Duration in seconds
    /// @param collateralToken Collateral token contract
    /// @param collateralTokenId Collateral token ID
    /// @param principal Principal value
    /// @param repayment Repayment in currency tokens
    struct Loan {
        LoanStatus status;
        uint64 maturity;
        uint64 duration;
        IERC721 collateralToken;
        uint256 collateralTokenId;
        uint256 principal;
        uint256 repayment;
    }

    struct Note {
        address noteToken;
        uint256 loanId;
    }

    /*********/
    /* State */
    /*********/

    /// @dev Asset token
    IERC20Upgradeable internal _asset;

    /// @dev Token decimals;
    uint8 internal _decimals;

    /// @dev withdrawal fees per 10_000 units
    uint256 public withdrawalFees;

    /// @notice Spice dev wallet
    address public dev;

    /// @notice Spice Multisig address
    address public multisig;

    /// @notice Fee recipient address
    address public feeRecipient;

    /// @dev Total assets value
    uint256 internal _totalAssets;

    /// @dev Note list
    EnumerableSetUpgradeable.AddressSet internal _noteTokens;

    /// @dev Note adapters
    mapping(address => INoteAdapter) internal _noteAdapters;

    /// @dev Mapping of collateral token contract to collateral token ID to note info
    mapping(address => mapping(uint256 => Note)) internal _notes;

    /// @dev Mapping of note token contract to loan ID to loan
    mapping(address => mapping(uint256 => Loan)) internal _loans;

    /// @dev Mapping of note token contract to list of loan IDs
    mapping(address => uint256[]) internal _pendingLoans;
}

/**
 * @title Storage for Vault, aggregated
 * @author Spice Finance Inc
 */
abstract contract VaultStorage is VaultStorageV1 {

}

/**
 * @title Vault
 * @author Spice Finance Inc
 */
contract Vault is
    IVault,
    VaultStorage,
    Initializable,
    ERC20Upgradeable,
    IERC4626Upgradeable,
    AccessControlEnumerableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    IERC721Receiver
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using MathUpgradeable for uint256;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    /*************/
    /* Constants */
    /*************/

    /// @notice Implementation version
    string public constant IMPLEMENTATION_VERSION = "1.0";

    /// @notice Time bucket duration in seconds
    uint256 public constant TIME_BUCKET_DURATION = 7 days;

    /************************/
    /* Access Control Roles */
    /************************/

    /// @notice Creator role
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");

    /// @notice Keeper role
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    /// @notice Liquidator role
    bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");

    /// @notice Bidder role
    bytes32 public constant BIDDER_ROLE = keccak256("BIDDER_ROLE");

    /// @notice Whitelist role
    bytes32 public constant WHITELIST_ROLE = keccak256("WHITELIST_ROLE");

    /// @notice Marketplace role
    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");

    /// @notice Asset receiver role
    bytes32 public constant ASSET_RECEIVER_ROLE =
        keccak256("ASSET_RECEIVER_ROLE");

    /**********/
    /* Errors */
    /**********/

    /// @notice Invalid address (e.g. zero address)
    error InvalidAddress();

    /// @notice Parameter out of bounds
    error ParameterOutOfBounds();

    /// @notice Insufficient balance
    error InsufficientBalance();

    /// @notice Not whitelisted
    error NotWhitelisted();

    /**********/
    /* Events */
    /**********/

    /// @notice Emitted when withdrawal fee rate is updated
    /// @param withdrawalFees New withdrawal fees per 10_000 units
    event WithdrawalFeeRateUpdated(uint256 withdrawalFees);

    /// @notice Emitted when dev is updated
    /// @param dev New dev address
    event DevUpdated(address dev);

    /// @notice Emitted when multisig is updated
    /// @param multisig New multisig address
    event MultisigUpdated(address multisig);

    /// @notice Emitted when fee recipient is updated
    /// @param feeRecipient New fee recipient address
    event FeeRecipientUpdated(address feeRecipient);

    /// @notice Emitted when note adapter is updated
    /// @param noteToken Note token contract
    /// @param noteAdapter Note adapter contract
    event NoteAdapterUpdated(address indexed noteToken, address noteAdapter);

    /***************/
    /* Constructor */
    /***************/

    /// @notice Vault constructor (for proxy)
    /// @param _name Receipt token name
    /// @param _symbol Receipt token symbol
    /// @param __asset Asset token contract
    /// @param _marketplaces Marketplaces
    /// @param _creator Creator address
    /// @param _dev Initial dev address
    /// @param _multisig Initial multisig address
    /// @param _feeRecipient Initial fee recipient address
    function initialize(
        string calldata _name,
        string calldata _symbol,
        address __asset,
        address[] memory _marketplaces,
        address _creator,
        address _dev,
        address _multisig,
        address _feeRecipient
    ) external initializer {
        if (__asset == address(0)) {
            revert InvalidAddress();
        }
        if (_creator == address(0)) {
            revert InvalidAddress();
        }
        if (_dev == address(0)) {
            revert InvalidAddress();
        }
        if (_multisig == address(0)) {
            revert InvalidAddress();
        }
        if (_feeRecipient == address(0)) {
            revert InvalidAddress();
        }

        __ERC20_init(_name, _symbol);
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        dev = _dev;
        multisig = _multisig;
        feeRecipient = _feeRecipient;

        _setupRole(CREATOR_ROLE, _creator);
        _setupRole(DEFAULT_ADMIN_ROLE, _dev);
        _setupRole(DEFAULT_ADMIN_ROLE, _multisig);
        _setupRole(ASSET_RECEIVER_ROLE, _multisig);
        _setupRole(KEEPER_ROLE, _dev);
        _setupRole(LIQUIDATOR_ROLE, _dev);
        _setupRole(BIDDER_ROLE, _dev);

        uint256 length = _marketplaces.length;
        for (uint256 i; i != length; ++i) {
            if (_marketplaces[i] == address(0)) {
                revert InvalidAddress();
            }
            _setupRole(MARKETPLACE_ROLE, _marketplaces[i]);
        }

        uint8 __decimals;
        try IERC20MetadataUpgradeable(address(__asset)).decimals() returns (
            uint8 value
        ) {
            __decimals = value;
        } catch {
            __decimals = super.decimals();
        }

        _asset = IERC20Upgradeable(__asset);
        _decimals = __decimals;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /***********/
    /* Getters */
    /***********/

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
    function maxWithdraw(address owner) external view returns (uint256) {
        return
            _convertToAssets(
                balanceOf(owner).mulDiv(10_000 - withdrawalFees, 10_000),
                MathUpgradeable.Rounding.Up
            );
    }

    /// @notice See {IERC4626-maxRedeem}
    function maxRedeem(address owner) external view returns (uint256) {
        return balanceOf(owner).mulDiv(10_000 - withdrawalFees, 10_000);
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
        return
            _convertToShares(
                assets.mulDiv(10_000, 10_000 - withdrawalFees),
                MathUpgradeable.Rounding.Up
            );
    }

    /// @notice See {IERC4626-previewRedeem}
    function previewRedeem(uint256 shares) public view returns (uint256) {
        return
            _convertToAssets(
                shares.mulDiv(10_000 - withdrawalFees, 10_000),
                MathUpgradeable.Rounding.Down
            );
    }

    /******************/
    /* User Functions */
    /******************/

    /// See {IERC4626-deposit}.
    function deposit(
        uint256 assets,
        address receiver
    ) external whenNotPaused nonReentrant returns (uint256 shares) {
        // Validate amount
        if (assets == 0) {
            revert ParameterOutOfBounds();
        }

        // Compute number of shares to mint from current vault share price
        shares = previewDeposit(assets);

        _deposit(msg.sender, assets, shares, receiver);

        // Transfer cash from user to vault
        _asset.safeTransferFrom(msg.sender, address(this), assets);
    }

    /// See {IERC4626-mint}.
    function mint(
        uint256 shares,
        address receiver
    ) external whenNotPaused nonReentrant returns (uint256 assets) {
        // Validate amount
        if (shares == 0) {
            revert ParameterOutOfBounds();
        }

        // Compute number of shares to mint from current vault share price
        assets = previewMint(shares);

        _deposit(msg.sender, assets, shares, receiver);

        // Transfer cash from user to vault
        _asset.safeTransferFrom(msg.sender, address(this), assets);
    }

    /// See {IERC4626-redeem}.
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external whenNotPaused nonReentrant returns (uint256 assets) {
        if (receiver == address(0)) {
            revert InvalidAddress();
        }
        if (shares == 0) {
            revert ParameterOutOfBounds();
        }

        // compute redemption amount
        assets = previewRedeem(shares);

        // compute fee
        uint256 fees = _convertToAssets(shares, MathUpgradeable.Rounding.Down) -
            assets;

        _withdraw(msg.sender, receiver, owner, assets, shares, fees);
    }

    /// See {IERC4626-withdraw}.
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external whenNotPaused nonReentrant returns (uint256 shares) {
        if (receiver == address(0)) {
            revert InvalidAddress();
        }
        if (assets == 0) {
            revert ParameterOutOfBounds();
        }

        // compute share amount
        shares = previewWithdraw(assets);

        // compute fee
        uint256 fees = _convertToAssets(
            shares - _convertToShares(assets, MathUpgradeable.Rounding.Up),
            MathUpgradeable.Rounding.Down
        );

        _withdraw(msg.sender, receiver, owner, assets, shares, fees);
    }

    /*****************************/
    /* Internal Helper Functions */
    /*****************************/

    function _convertToShares(
        uint256 assets,
        MathUpgradeable.Rounding rounding
    ) internal view returns (uint256 shares) {
        uint256 supply = totalSupply();
        return
            (assets == 0 || supply == 0)
                ? assets
                : assets.mulDiv(supply, totalAssets(), rounding);
    }

    function _convertToAssets(
        uint256 shares,
        MathUpgradeable.Rounding rounding
    ) internal view returns (uint256 assets) {
        uint256 supply = totalSupply();
        return
            (supply == 0)
                ? shares
                : shares.mulDiv(totalAssets(), supply, rounding);
    }

    /// @dev Deposit/mint common workflow.
    function _deposit(
        address caller,
        uint256 assets,
        uint256 shares,
        address receiver
    ) internal {
        // Check caller role
        if (
            getRoleMemberCount(WHITELIST_ROLE) > 0 &&
            !hasRole(WHITELIST_ROLE, caller)
        ) {
            revert NotWhitelisted();
        }

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
        uint256 shares,
        uint256 fees
    ) internal {
        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }

        if (_asset.balanceOf(address(this)) < assets)
            revert InsufficientBalance();

        _burn(owner, shares);

        _asset.safeTransfer(receiver, assets);

        uint256 half = fees / 2;
        _asset.safeTransfer(multisig, half);
        _asset.safeTransfer(feeRecipient, fees - half);

        _totalAssets = _totalAssets - assets;

        emit Withdraw(msg.sender, msg.sender, owner, assets, shares);
    }

    /// @dev Store loan info when new note token is received
    /// @param noteToken Note token contract
    /// @param noteTokenId Note token ID
    function _onNoteReceived(address noteToken, uint256 noteTokenId) internal {
        // Lookup note adapter
        INoteAdapter noteAdapter = _noteAdapters[noteToken];

        // Get loan info
        INoteAdapter.LoanInfo memory loanInfo = noteAdapter.getLoanInfo(
            noteTokenId
        );

        // Store loan state
        Loan storage loan = _loans[noteToken][loanInfo.loanId];
        loan.status = LoanStatus.Active;
        loan.maturity = loanInfo.maturity;
        loan.duration = loanInfo.duration;
        loan.collateralToken = IERC721(loanInfo.collateralToken);
        loan.collateralTokenId = loanInfo.collateralTokenId;
        loan.principal = loanInfo.principal;
        loan.repayment = loanInfo.repayment;

        // Store note
        Note storage note = _notes[loanInfo.collateralToken][loanInfo.collateralTokenId];
        note.noteToken = noteToken;
        note.loanId = loanInfo.loanId;

        // Add loan to pending loan ids
        _pendingLoans[noteToken].push(loanInfo.loanId);

        // update total assets
        calcTotalAssets();
    }

    /***********/
    /* Setters */
    /***********/

    /// @notice Set the admin fee rate
    ///
    /// Emits a {WithdrawalFeeRateUpdated} event.
    ///
    /// @param _withdrawalFees Withdrawal fees per 10_000 units
    function setWithdrawalFees(
        uint256 _withdrawalFees
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_withdrawalFees > 10_000) {
            revert ParameterOutOfBounds();
        }
        withdrawalFees = _withdrawalFees;
        emit WithdrawalFeeRateUpdated(_withdrawalFees);
    }

    /// @notice Set the fee recipient address
    ///
    /// Emits a {FeeRecipientUpdated} event.
    ///
    /// @param _feeRecipient New fee recipient address
    function setFeeRecipient(
        address _feeRecipient
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_feeRecipient == address(0)) {
            revert InvalidAddress();
        }
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    /// @notice Set the dev wallet address
    ///
    /// Emits a {DevUpdated} event.
    ///
    /// @param _dev New dev wallet
    function setDev(address _dev) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_dev == address(0)) {
            revert InvalidAddress();
        }

        address oldDev = dev;
        _revokeRole(DEFAULT_ADMIN_ROLE, oldDev);
        _revokeRole(KEEPER_ROLE, oldDev);
        _revokeRole(LIQUIDATOR_ROLE, oldDev);
        _revokeRole(BIDDER_ROLE, oldDev);

        dev = _dev;

        _setupRole(DEFAULT_ADMIN_ROLE, _dev);
        _setupRole(KEEPER_ROLE, _dev);
        _setupRole(LIQUIDATOR_ROLE, _dev);
        _setupRole(BIDDER_ROLE, _dev);

        emit DevUpdated(_dev);
    }

    /// @notice Set the multisig address
    ///
    /// Emits a {MultisigUpdated} event.
    ///
    /// @param _multisig New multisig address
    function setMultisig(
        address _multisig
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_multisig == address(0)) {
            revert InvalidAddress();
        }

        address oldMultisig = multisig;
        _revokeRole(DEFAULT_ADMIN_ROLE, oldMultisig);
        _revokeRole(ASSET_RECEIVER_ROLE, oldMultisig);

        multisig = _multisig;

        _setupRole(DEFAULT_ADMIN_ROLE, _multisig);
        _setupRole(ASSET_RECEIVER_ROLE, _multisig);

        emit MultisigUpdated(_multisig);
    }

    // @notice Set note adapter contract
    //
    // Emits a {NoteAdapterUpdated} event.
    //
    // @param noteToken Note token contract
    // @param noteAdapter Note adapter contract
    function setNoteAdapter(
        address noteToken,
        address noteAdapter
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
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
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause contract
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /*************/
    /* Admin API */
    /*************/

    /// @notice Approves asset to spender
    /// @param spender Spender address
    /// @param amount Approve amount
    function approveAsset(address spender, uint256 amount) external {
        require(
            hasRole(BIDDER_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender)
        );
        _checkRole(MARKETPLACE_ROLE, spender);
        _asset.approve(spender, amount);
    }

    /// @notice Transfer NFT out of vault
    /// @param nft NFT contract address
    /// @param nftId NFT token ID
    function transferNFT(
        address nft,
        uint256 nftId
    ) external onlyRole(LIQUIDATOR_ROLE) {
        Note storage note = _notes[nft][nftId];
        Loan storage loan = _loans[note.noteToken][note.loanId];
        loan.status = LoanStatus.Liquidated;

        IERC721Upgradeable token = IERC721Upgradeable(nft);
        require(token.ownerOf(nftId) == address(this));

        token.safeTransferFrom(address(this), msg.sender, nftId);
    }

    /// @notice Transfer NFT out of vault
    /// @param nft NFT contract address
    /// @param nftId NFT token ID
    /// @param payment Payment amount
    function payLoan(
        address nft,
        uint256 nftId,
        uint256 payment
    ) external onlyRole(LIQUIDATOR_ROLE) {
        Note storage note = _notes[nft][nftId];
        Loan storage loan = _loans[note.noteToken][note.loanId];
        loan.status = LoanStatus.Complete;

        _asset.safeTransferFrom(msg.sender, address(this), payment);
    }

    /// @notice Calculate total assets using current loans info
    function calcTotalAssets() public {
        uint256 newTotalAssets = _asset.balanceOf(address(this));

        // For each note token
        uint256 numNoteTokens = _noteTokens.length();
        for (uint256 i; i != numNoteTokens; ++i) {
            // Get note token
            address noteToken = _noteTokens.at(i);

            // Lookup note adapter
            INoteAdapter noteAdapter = _noteAdapters[noteToken];

            // For each loan ID
            uint256 numLoans = _pendingLoans[noteToken].length;
            for (uint256 j; j != numLoans; ) {
                // Get loan ID
                uint256 loanId = _pendingLoans[noteToken][j];

                // Lookup loan state
                Loan memory loan = _loans[noteToken][loanId];

                if (
                    loan.status == LoanStatus.Active &&
                    loan.collateralToken.ownerOf(loan.collateralTokenId) ==
                    address(this)
                ) {
                    loan.status = LoanStatus.Liquidated;
                }

                if (loan.status == LoanStatus.Liquidated) {
                    newTotalAssets += loan.repayment;
                } else if (loan.status == LoanStatus.Complete || noteAdapter.isRepaid(loanId)) {
                    // remove loan and loan ID
                    delete loan;
                    delete _notes[address(loan.collateralToken)][loan.collateralTokenId];
                    --numLoans;
                    _pendingLoans[noteToken][j] = _pendingLoans[noteToken][
                        numLoans
                    ];
                    _pendingLoans[noteToken].pop();
                } else {
                    // price loan when active
                    uint256 repayment = loan.repayment;
                    uint256 interest = repayment - loan.principal;
                    uint256 maturity = loan.maturity;
                    uint256 timeRemaining = maturity > block.timestamp ? maturity - block.timestamp : 0;
                    newTotalAssets += repayment - interest * timeRemaining / loan.duration;
                }
            }
        }

        _totalAssets = newTotalAssets;
    }

    /************/
    /* ERC-1271 */
    /************/

    /// See {IERC1271-isValidSignature}
    function isValidSignature(
        bytes32 hash,
        bytes memory signature
    ) external view returns (bytes4 magicValue) {
        // Validate signatures
        (address signer, ECDSA.RecoverError err) = ECDSA.tryRecover(
            hash,
            signature
        );
        if (
            err == ECDSA.RecoverError.NoError &&
            hasRole(DEFAULT_ADMIN_ROLE, signer)
        ) {
            // bytes4(keccak256("isValidSignature(bytes32,bytes)"))
            return 0x1626ba7e;
        } else {
            return 0xffffffff;
        }
    }

    /***********/
    /* ERC-721 */
    /***********/

    /// See {IERC721Receiver-onERC721Received}
    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) public override returns (bytes4) {
        address nft = msg.sender;
        if (_noteAdapters[nft] != INoteAdapter(address(0))) {
            _onNoteReceived(nft, tokenId);
        }

        return this.onERC721Received.selector;
    }
}
