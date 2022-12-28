// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC4626Upgradeable.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";

import "../interfaces/IWETH.sol";
import "../interfaces/ISpiceFiNFT4626.sol";
import "../interfaces/IAggregatorVault.sol";

/**
 * @title Storage for SpiceFiNFT4626
 * @author Spice Finance Inc
 */
abstract contract SpiceFiNFT4626Storage {
    /// @notice withdrawal fees per 10_000 units
    uint256 public withdrawalFees;

    /// @notice Total shares
    uint256 public totalShares;

    /// @notice Mapping TokenId => Shares
    mapping(uint256 => uint256) public tokenShares;

    /// @notice Indicates whether the vault is verified or not
    bool public verified;

    /// @notice Spice Multisig address
    address public multisig;

    /// @notice Fee recipient address
    address public feeRecipient;

    /// @notice Token ID Pointer
    uint256 internal _tokenIdPointer;

    /// @notice Preview Metadata URI
    string internal _previewUri;

    /// @notice Metadata URI
    string internal _baseUri;

    /// @notice Revealed;
    bool internal _revealed;

    /// @notice Withdrawable
    bool internal _withdrawable;
}

/**
 * @title SpiceFiNFT4626
 * @author Spice Finance Inc
 */
contract SpiceFiNFT4626 is
    ISpiceFiNFT4626,
    IAggregatorVault,
    SpiceFiNFT4626Storage,
    UUPSUpgradeable,
    ERC721Upgradeable,
    PausableUpgradeable,
    AccessControlEnumerableUpgradeable,
    ReentrancyGuardUpgradeable,
    Multicall
{
    using SafeMathUpgradeable for uint256;
    using MathUpgradeable for uint256;
    using StringsUpgradeable for uint256;

    /*************/
    /* Constants */
    /*************/

    /// @notice WETH address
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    /// @notice Rebalance vault assets using ERC4626 client interface
    bytes32 public constant STRATEGIST_ROLE = keccak256("STRATEGIST_ROLE");

    /// @notice Contracts that funds can be sent to
    bytes32 public constant VAULT_ROLE = keccak256("VAULT_ROLE");

    /// @notice Contracts that receive fees
    bytes32 public constant ASSET_RECEIVER_ROLE =
        keccak256("ASSET_RECEIVER_ROLE");

    /// @notice Contracts allowed to deposit
    bytes32 public constant USER_ROLE = keccak256("USER_ROLE");

    /// @notice Spice role
    bytes32 public constant SPICE_ROLE = keccak256("SPICE_ROLE");

    /// @notice Max NFT Supply
    uint256 constant MAX_SUPPLY = 555;

    /// @notice Mint price
    uint256 constant MINT_PRICE = 0.08 ether;

    /**********/
    /* Errors */
    /**********/

    /// @notice Invalid address (e.g. zero address)
    error InvalidAddress();

    /// @notice Parameter out of bounds
    error ParameterOutOfBounds();

    /// @notice More than one NFT
    error MoreThanOne();

    /// @notice MAX_SUPPLY NFTs are minted
    error OutOfSupply();

    /// @notice User not owning token
    error InvalidTokenId();

    /// @notice Metadata revealed
    error MetadataRevealed();

    /// @notice Withdraw before reveal
    error WithdrawBeforeReveal();

    /// @notice Withdraw is disabled
    error WithdrawDisabled();

    /// @notice Insufficient share balance
    error InsufficientShareBalance();

    /// @notice Slippage too high
    error SlippageTooHigh();

    /**********/
    /* Events */
    /**********/

    /// @notice Emitted when withdrawal fee rate is updated
    /// @param withdrawalFees New withdrawal fees per 10_000 units
    event WithdrawalFeeRateUpdated(uint256 withdrawalFees);

    /// @notice Emitted when multisig is updated
    /// @param multisig New multisig address
    event MultisigUpdated(address multisig);

    /// @notice Emitted when fee recipient is updated
    /// @param feeRecipient New fee recipient address
    event FeeRecipientUpdated(address feeRecipient);

    /***************/
    /* Constructor */
    /***************/

    /// @notice SpiceFiNFT4626 constructor (for proxy)
    /// @param strategist_ Initial strategist address
    /// @param assetReceiver_ Initial asset receiver address
    /// @param withdrawalFees_ Initial withdrawal fees
    /// @param multisig_ Initial multisig address
    /// @param feeRecipient_ Initial fee recipient address
    function initialize(
        address strategist_,
        address assetReceiver_,
        uint256 withdrawalFees_,
        address multisig_,
        address feeRecipient_
    ) public initializer {
        if (strategist_ == address(0)) {
            revert InvalidAddress();
        }
        if (assetReceiver_ == address(0)) {
            revert InvalidAddress();
        }
        if (withdrawalFees_ >= 10_000) {
            revert ParameterOutOfBounds();
        }
        if (multisig_ == address(0)) {
            revert InvalidAddress();
        }
        if (feeRecipient_ == address(0)) {
            revert InvalidAddress();
        }

        __ERC721_init("Spice Finance", "SPICE");

        withdrawalFees = withdrawalFees_;
        multisig = multisig_;
        feeRecipient = feeRecipient_;

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(DEFAULT_ADMIN_ROLE, multisig);

        _setupRole(STRATEGIST_ROLE, strategist_);
        _setupRole(ASSET_RECEIVER_ROLE, assetReceiver_);
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Set withdrawal fees
    ///
    /// Emits a {WithdrawalFeeRateUpdated} event.
    ///
    /// @param withdrawalFees_ New withdrawal fees per 10_000 units
    function setWithdrawalFees(
        uint256 withdrawalFees_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (withdrawalFees_ >= 10_000) {
            revert ParameterOutOfBounds();
        }
        withdrawalFees = withdrawalFees_;
        emit WithdrawalFeeRateUpdated(withdrawalFees_);
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
        multisig = _multisig;
        emit MultisigUpdated(_multisig);
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

    /// @notice Sets preview uri
    /// @param previewUri New preview uri
    function setPreviewURI(
        string memory previewUri
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_revealed) {
            revert MetadataRevealed();
        }

        _previewUri = previewUri;
    }

    /// @notice Sets base uri and reveal
    /// @param baseUri Metadata base uri
    function setBaseURI(
        string memory baseUri
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revealed = true;
        _baseUri = baseUri;
    }

    /// @notice Set verified
    /// @param verified_ New verified value
    function setVerified(bool verified_) external onlyRole(SPICE_ROLE) {
        verified = verified_;
    }

    /// @notice Set withdrawable
    /// @param withdrawable_ New withdrawable value
    function setWithdrawable(
        bool withdrawable_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _withdrawable = withdrawable_;
    }

    /// @notice trigger paused state
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice return to normal state
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /***********/
    /* Getters */
    /***********/

    /// @notice See {ISpiceFiNFT4626-asset}
    function asset() public pure returns (address) {
        return WETH;
    }

    /// @notice See {ISpiceFiNFT4626-totalAssets}
    function totalAssets() public view returns (uint256) {
        uint256 balance = IERC20Upgradeable(asset()).balanceOf(address(this));

        IERC4626Upgradeable vault;
        uint256 count = getRoleMemberCount(VAULT_ROLE);
        for (uint256 i; i != count; ) {
            vault = IERC4626Upgradeable(getRoleMember(VAULT_ROLE, i));
            balance += vault.previewRedeem(vault.balanceOf(address(this)));
            unchecked {
                ++i;
            }
        }
        return balance;
    }

    /// @notice See {ISpiceFiNFT4626-convertToShares}
    function convertToShares(uint256 assets) external view returns (uint256) {
        return _convertToShares(assets, MathUpgradeable.Rounding.Down);
    }

    /// @notice See {ISpiceFiNFT4626-convertToAssets}
    function convertToAssets(uint256 shares) external view returns (uint256) {
        return _convertToAssets(shares, MathUpgradeable.Rounding.Down);
    }

    /// @notice See {ISpiceFiNFT4626-maxDeposit}
    function maxDeposit(address) public view override returns (uint256) {
        return paused() ? 0 : type(uint256).max;
    }

    /// @notice See {ISpiceFiNFT4626-maxMint}
    function maxMint(address) public view override returns (uint256) {
        return paused() ? 0 : type(uint256).max;
    }

    /// @notice See {ISpiceFiNFT4626-maxWithdraw}
    function maxWithdraw(address) public view override returns (uint256) {
        uint256 balance = IERC20Upgradeable(asset()).balanceOf(address(this));
        return paused() ? 0 : balance.mulDiv(10_000 - withdrawalFees, 10_000);
    }

    /// @notice See {ISpiceFiNFT4626-maxRedeem}
    function maxRedeem(address) public view override returns (uint256) {
        uint256 balance = IERC20MetadataUpgradeable(asset()).balanceOf(
            address(this)
        );
        return
            paused()
                ? 0
                : _convertToShares(
                    balance.mulDiv(10_000 - withdrawalFees, 10_000),
                    MathUpgradeable.Rounding.Down
                );
    }

    /// @notice See {ISpiceFiNFT4626-previewDeposit}
    function previewDeposit(uint256 assets) public view returns (uint256) {
        return _convertToShares(assets, MathUpgradeable.Rounding.Down);
    }

    /// @notice See {ISpiceFiNFT4626-previewMint}
    function previewMint(uint256 shares) public view returns (uint256) {
        return _convertToAssets(shares, MathUpgradeable.Rounding.Up);
    }

    /// @notice See {ISpiceFiNFT4626-previewWithdraw}
    function previewWithdraw(
        uint256 assets
    ) public view override returns (uint256) {
        return
            _convertToShares(
                assets.mulDiv(10_000, 10_000 - withdrawalFees),
                MathUpgradeable.Rounding.Up
            );
    }

    /// @notice See {ISpiceFiNFT4626-previewRedeem}
    function previewRedeem(
        uint256 shares
    ) public view override returns (uint256) {
        return
            _convertToAssets(
                shares.mulDiv(10_000 - withdrawalFees, 10_000),
                MathUpgradeable.Rounding.Down
            );
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721Upgradeable, AccessControlEnumerableUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @notice See {IERC721Metadata-tokenURI}.
    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        _requireMinted(tokenId);

        if (!_revealed) {
            return _previewUri;
        }

        string memory baseURI = _baseUri;
        return
            bytes(baseURI).length > 0
                ? string(abi.encodePacked(baseURI, tokenId.toString()))
                : "";
    }

    /******************/
    /* User Functions */
    /******************/

    /// See {ISpiceFiNFT4626-deposit}.
    function deposit(
        uint256 tokenId,
        uint256 assets
    ) external whenNotPaused nonReentrant returns (uint256 shares) {
        // Compute number of shares to mint from current vault share price
        shares = previewDeposit(assets);

        if (assets > 0) {
            IERC20Upgradeable weth = IERC20Upgradeable(WETH);
            weth.transferFrom(msg.sender, address(this), assets);
        }

        _deposit(msg.sender, tokenId, assets, shares);
    }

    /// See {ISpiceFiNFT4626-mint}.
    function mint(
        uint256 tokenId,
        uint256 shares
    ) external whenNotPaused nonReentrant returns (uint256 assets) {
        // Compute number of shares to mint from current vault share price
        assets = previewMint(shares);

        _deposit(msg.sender, tokenId, assets, shares);

        if (assets > 0) {
            IERC20Upgradeable weth = IERC20Upgradeable(WETH);
            weth.transferFrom(msg.sender, address(this), assets);
        }
    }

    /// See {ISpiceFiNFT4626-redeem}.
    function redeem(
        uint256 tokenId,
        uint256 shares,
        address receiver
    ) external whenNotPaused nonReentrant returns (uint256 assets) {
        if (tokenId == 0) {
            revert ParameterOutOfBounds();
        }
        if (shares == 0) {
            revert ParameterOutOfBounds();
        }
        if (receiver == address(0)) {
            revert InvalidAddress();
        }

        // compute redemption amount
        assets = previewRedeem(shares);

        // compute fee
        uint256 fees = _convertToAssets(shares, MathUpgradeable.Rounding.Down) -
            assets;

        _withdraw(msg.sender, tokenId, receiver, assets, shares, fees);
    }

    /// See {ISpiceFiNFT4626-withdraw}.
    function withdraw(
        uint256 tokenId,
        uint256 assets,
        address receiver
    ) external whenNotPaused nonReentrant returns (uint256 shares) {
        if (tokenId == 0) {
            revert ParameterOutOfBounds();
        }
        if (assets == 0) {
            revert ParameterOutOfBounds();
        }
        if (receiver == address(0)) {
            revert InvalidAddress();
        }

        // compute share amount
        shares = previewWithdraw(assets);

        // compute fee
        uint256 fees = _convertToAssets(
            shares - _convertToShares(assets, MathUpgradeable.Rounding.Up),
            MathUpgradeable.Rounding.Down
        );

        _withdraw(msg.sender, tokenId, receiver, assets, shares, fees);
    }

    /*****************************/
    /* Internal Helper Functions */
    /*****************************/

    function _convertToShares(
        uint256 assets,
        MathUpgradeable.Rounding rounding
    ) internal view returns (uint256 shares) {
        uint256 _totalShares = totalShares;
        return
            (assets == 0 || _totalShares == 0)
                ? assets
                : assets.mulDiv(_totalShares, totalAssets(), rounding);
    }

    function _convertToAssets(
        uint256 shares,
        MathUpgradeable.Rounding rounding
    ) internal view returns (uint256 assets) {
        uint256 _totalShares = totalShares;
        return
            (_totalShares == 0)
                ? shares
                : shares.mulDiv(totalAssets(), _totalShares, rounding);
    }

    function _mintInternal(address user) internal returns (uint256 tokenId) {
        if (balanceOf(user) > 0) {
            revert MoreThanOne();
        }

        if (_tokenIdPointer == MAX_SUPPLY) {
            revert OutOfSupply();
        }

        unchecked {
            tokenId = ++_tokenIdPointer;
        }

        IERC20Upgradeable weth = IERC20Upgradeable(WETH);
        address admin = getRoleMember(SPICE_ROLE, 0);
        weth.transferFrom(msg.sender, admin, MINT_PRICE);

        _mint(user, tokenId);
    }

    function _withdraw(
        address caller,
        uint256 tokenId,
        address receiver,
        uint256 assets,
        uint256 shares,
        uint256 fees
    ) internal {
        if (!_revealed) {
            revert WithdrawBeforeReveal();
        }
        if (!_withdrawable) {
            revert WithdrawDisabled();
        }
        if (ownerOf(tokenId) != caller) {
            revert InvalidTokenId();
        }

        if (tokenShares[tokenId] < shares) {
            revert InsufficientShareBalance();
        }

        totalShares -= shares;
        tokenShares[tokenId] -= shares;

        uint256 half = fees / 2;

        IERC20Upgradeable weth = IERC20Upgradeable(WETH);
        weth.transfer(multisig, half);
        weth.transfer(feeRecipient, fees - half);
        weth.transfer(receiver, assets);

        emit Withdraw(caller, tokenId, receiver, assets, shares);
    }

    function _deposit(
        address caller,
        uint256 tokenId,
        uint256 assets,
        uint256 shares
    ) internal {
        require(
            getRoleMemberCount(USER_ROLE) == 0 || hasRole(USER_ROLE, caller),
            "caller is not enabled"
        );

        if (tokenId == 0) {
            // mints new NFT
            tokenId = _mintInternal(caller);
        } else if (ownerOf(tokenId) != caller) {
            revert InvalidTokenId();
        }

        tokenShares[tokenId] += shares;
        totalShares += shares;

        emit Deposit(caller, tokenId, assets, shares);
    }

    /// See {IAggregatorVault-deposit}
    function deposit(
        address vault,
        uint256 assets,
        uint256 minShares
    ) public nonReentrant onlyRole(STRATEGIST_ROLE) returns (uint256 shares) {
        _checkRole(VAULT_ROLE, vault);
        SafeERC20Upgradeable.safeIncreaseAllowance(
            IERC20MetadataUpgradeable(asset()),
            vault,
            assets
        );
        shares = IERC4626Upgradeable(vault).deposit(assets, address(this));

        if (minShares > shares) {
            revert SlippageTooHigh();
        }
    }

    /// See {IAggregatorVault-mint}
    function mint(
        address vault,
        uint256 shares,
        uint256 maxAssets
    ) public nonReentrant onlyRole(STRATEGIST_ROLE) returns (uint256 assets) {
        _checkRole(VAULT_ROLE, vault);
        uint256 assets_ = IERC4626Upgradeable(vault).previewMint(shares);
        SafeERC20Upgradeable.safeIncreaseAllowance(
            IERC20MetadataUpgradeable(asset()),
            vault,
            assets_
        );
        assets = IERC4626Upgradeable(vault).mint(shares, address(this));

        if (maxAssets < assets) {
            revert SlippageTooHigh();
        }
    }

    /// See {IAggregatorVault-withdraw}
    function withdraw(
        address vault,
        uint256 assets,
        uint256 maxShares
    ) public nonReentrant onlyRole(STRATEGIST_ROLE) returns (uint256 shares) {
        _checkRole(VAULT_ROLE, vault);
        shares = IERC4626Upgradeable(vault).withdraw(
            assets,
            address(this),
            address(this)
        );

        if (maxShares < shares) {
            revert SlippageTooHigh();
        }
    }

    /// See {IAggregatorVault-redeem}
    function redeem(
        address vault,
        uint256 shares,
        uint256 minAssets
    ) public nonReentrant onlyRole(STRATEGIST_ROLE) returns (uint256 assets) {
        _checkRole(VAULT_ROLE, vault);
        assets = IERC4626Upgradeable(vault).redeem(
            shares,
            address(this),
            address(this)
        );

        if (minAssets > assets) {
            revert SlippageTooHigh();
        }
    }
}
