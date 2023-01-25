// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC4626Upgradeable.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";

import "../interfaces/ISpiceFiNFT4626.sol";
import "../interfaces/IAggregatorVault.sol";
import "../interfaces/IERC4906.sol";

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

    /// @notice Spice dev wallet
    address public dev;

    /// @notice Spice Multisig address
    address public multisig;

    /// @notice Fee recipient address
    address public feeRecipient;

    /// @notice NFT mint price
    uint256 public mintPrice;

    /// @notice Max totla supply
    uint256 public maxSupply;

    /// @notice Token ID Pointer
    uint256 internal _tokenIdPointer;

    /// @notice Preview Metadata URI
    string internal _previewUri;

    /// @notice Metadata URI
    string internal _baseUri;

    /// @notice Asset token address
    address internal _asset;

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
    ERC721Upgradeable,
    PausableUpgradeable,
    AccessControlEnumerableUpgradeable,
    ReentrancyGuardUpgradeable,
    Multicall,
    IERC4906
{
    using SafeMathUpgradeable for uint256;
    using MathUpgradeable for uint256;
    using StringsUpgradeable for uint256;

    /*************/
    /* Constants */
    /*************/

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

    /// @notice Creator role
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");

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

    /// @notice Emitted when dev is updated
    /// @param dev New dev address
    event DevUpdated(address dev);

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
    /// @param _name Token name
    /// @param _symbol Token symbol
    /// @param __asset Asset token address
    /// @param _mintPrice NFT mint price
    /// @param _maxSupply Max total supply
    /// @param _vaults Vault addresses
    /// @param _creator Creator address
    /// @param _dev Spice dev wallet
    /// @param _multisig Spice multisig wallet
    /// @param _feeRecipient Initial fee recipient address
    function initialize(
        string memory _name,
        string memory _symbol,
        address __asset,
        uint256 _mintPrice,
        uint256 _maxSupply,
        address[] memory _vaults,
        address _creator,
        address _dev,
        address _multisig,
        address _feeRecipient
    ) public initializer {
        if (__asset == address(0)) {
            revert InvalidAddress();
        }
        if (_maxSupply == 0) {
            revert ParameterOutOfBounds();
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

        __ERC721_init(_name, _symbol);

        _asset = __asset;
        mintPrice = _mintPrice;
        maxSupply = _maxSupply;
        dev = _dev;
        multisig = _multisig;
        feeRecipient = _feeRecipient;

        uint256 length = _vaults.length;
        for (uint256 i; i != length; ++i) {
            if (_vaults[i] == address(0)) {
                revert InvalidAddress();
            }
            _setupRole(VAULT_ROLE, _vaults[i]);
        }

        _setupRole(CREATOR_ROLE, _creator);
        _setupRole(DEFAULT_ADMIN_ROLE, _dev);
        _setupRole(DEFAULT_ADMIN_ROLE, _multisig);
        _setupRole(STRATEGIST_ROLE, _dev);
        _setupRole(ASSET_RECEIVER_ROLE, _multisig);
        _setupRole(USER_ROLE, _dev);
        _setupRole(USER_ROLE, _multisig);
        _setupRole(USER_ROLE, _creator);
        _setupRole(SPICE_ROLE, _multisig);
    }

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
        if (withdrawalFees_ > 10_000) {
            revert ParameterOutOfBounds();
        }
        withdrawalFees = withdrawalFees_;
        emit WithdrawalFeeRateUpdated(withdrawalFees_);
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
        _revokeRole(STRATEGIST_ROLE, oldDev);
        _revokeRole(USER_ROLE, oldDev);

        dev = _dev;

        _setupRole(DEFAULT_ADMIN_ROLE, _dev);
        _setupRole(STRATEGIST_ROLE, _dev);
        _setupRole(USER_ROLE, _dev);

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
        _revokeRole(USER_ROLE, oldMultisig);
        _revokeRole(SPICE_ROLE, oldMultisig);

        multisig = _multisig;

        _setupRole(DEFAULT_ADMIN_ROLE, _multisig);
        _setupRole(ASSET_RECEIVER_ROLE, _multisig);
        _setupRole(USER_ROLE, _multisig);
        _setupRole(SPICE_ROLE, _multisig);

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
	if (_tokenIdPointer > 0) {
	  emit BatchMetadataUpdate(1, _tokenIdPointer);
       }
    }

    /// @notice Sets base uri and reveal
    /// @param baseUri Metadata base uri
    function setBaseURI(
        string memory baseUri
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revealed = true;
        _baseUri = baseUri;
	if (_tokenIdPointer > 0) {
	  emit BatchMetadataUpdate(1, _tokenIdPointer);
       }
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
    function asset() public view returns (address) {
        return _asset;
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

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721Upgradeable, AccessControlEnumerableUpgradeable)
        returns (bool)
    {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }

    function contractURI() public pure returns (string memory) {
      return "https://b3ec853c.spicefi.xyz/metadata/os";
    }

    /// @notice See {IERC721Metadata-tokenURI}.
    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        _requireMinted(tokenId);

        if (!_revealed) {
	  string memory previewURI = _previewUri;
	  return
            bytes(previewURI).length > 0
	    ? string(abi.encodePacked(previewURI, tokenId.toString()))
	    : "";
        }

        string memory baseURI = _baseUri;
        return
            bytes(baseURI).length > 0
                ? string(abi.encodePacked(baseURI, tokenId.toString()))
                : "";
    }

    /// @notice Return total supply
    /// @return totalSupply Current total supply
    function totalSupply() external view returns (uint256) {
        return _tokenIdPointer;
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
            IERC20Upgradeable(_asset).transferFrom(
                msg.sender,
                address(this),
                assets
            );
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
            IERC20Upgradeable(_asset).transferFrom(
                msg.sender,
                address(this),
                assets
            );
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

        if (_tokenIdPointer == maxSupply) {
            revert OutOfSupply();
        }

        unchecked {
            tokenId = ++_tokenIdPointer;
        }

        address admin = getRoleMember(SPICE_ROLE, 0);
        IERC20Upgradeable(_asset).transferFrom(msg.sender, admin, mintPrice);

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

        IERC20Upgradeable currency = IERC20Upgradeable(_asset);
        currency.transfer(multisig, half);
        currency.transfer(feeRecipient, fees - half);
        currency.transfer(receiver, assets);

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

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view returns (address) {
      return getRoleMember(DEFAULT_ADMIN_ROLE, 0);
    }
}
