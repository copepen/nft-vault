// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";

/// @title Storage for SpiceFi4626
abstract contract SpiceFi4626Storage {
    /// @notice Spice role
    bytes32 public constant SPICE_ROLE = keccak256("SPICE_ROLE");

    /// @notice withdrawal fees per 10_000 units
    uint256 public withdrawalFees;

    /// @notice Max Total Supply
    uint256 public maxTotalSupply;

    /// @notice Indicates whether the vault is verified or not
    bool public verified;
}

/// @title SpiceFi4626
contract SpiceFi4626 is
    ERC4626Upgradeable,
    PausableUpgradeable,
    AccessControlEnumerableUpgradeable,
    UUPSUpgradeable,
    SpiceFi4626Storage
{
    using SafeMathUpgradeable for uint256;
    using MathUpgradeable for uint256;

    /////////////////////////////////////////////////////////////////////////
    /// Constants ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Spice Multisig
    address public constant multisig =
        address(0x7B15f2B26C25e1815Dc4FB8957cE76a0C5319582);

    /// @notice Rebalance vault assets using ERC4626 client interface
    bytes32 public constant STRATEGIST_ROLE = keccak256("STRATEGIST_ROLE");

    /// @notice Contracts that funds can be sent to
    bytes32 public constant VAULT_ROLE = keccak256("VAULT_ROLE");

    /// @notice Contracts that can be listed as "receiver" of shares in ERC4626 client calls
    bytes32 public constant VAULT_RECEIVER_ROLE =
        keccak256("VAULT_RECEIVER_ROLE");

    /// @notice Contracts that receive fees
    bytes32 public constant ASSET_RECEIVER_ROLE =
        keccak256("ASSET_RECEIVER_ROLE");

    /// @notice Contracts allowed to deposit
    bytes32 public constant USER_ROLE = keccak256("USER_ROLE");

    /////////////////////////////////////////////////////////////////////////
    /// Errors ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Invalid address (e.g. zero address)
    error InvalidAddress();

    /// @notice Parameter out of bounds
    error ParameterOutOfBounds();

    /////////////////////////////////////////////////////////////////////////
    /// Constructor ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice SpiceFi4626 constructor (for proxy)
    /// @param asset_ Asset token address
    /// @param strategist_ Default strategist address
    /// @param assetReceiver_ Default asset receiver address
    /// @param withdrawalFees_ Default withdrawal fees
    function initialize(
        address asset_,
        address strategist_,
        address assetReceiver_,
        uint256 withdrawalFees_
    ) public initializer {
        if (asset_ == address(0)) {
            revert InvalidAddress();
        }
        if (strategist_ == address(0)) {
            revert InvalidAddress();
        }
        if (assetReceiver_ == address(0)) {
            revert InvalidAddress();
        }
        if (withdrawalFees_ > 10_000) {
            revert ParameterOutOfBounds();
        }

        __ERC4626_init(IERC20MetadataUpgradeable(asset_));
        __ERC20_init("SpiceToken", "SPICE");

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(DEFAULT_ADMIN_ROLE, multisig);
        _setupRole(VAULT_RECEIVER_ROLE, address(this));

        _setupRole(STRATEGIST_ROLE, strategist_);
        _setupRole(ASSET_RECEIVER_ROLE, assetReceiver_);

        withdrawalFees = withdrawalFees_;
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {}

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice set withdrawal fees
    /// @param withdrawalFees_ withdrawal fees
    function setWithdrawalFees(uint256 withdrawalFees_)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (withdrawalFees_ > 10_000) {
            revert ParameterOutOfBounds();
        }

        withdrawalFees = withdrawalFees_;
    }

    /// @notice set max total supply
    /// @param maxTotalSupply_ max total supply
    function setMaxTotalSupply(uint256 maxTotalSupply_)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        maxTotalSupply = maxTotalSupply_;
    }

    /// @notice set verified
    /// @param verified_ new verified value
    function setVerified(bool verified_) public onlyRole(SPICE_ROLE) {
        verified = verified_;
    }

    /// @notice trigger paused state
    function pause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice return to normal state
    function unpause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @inheritdoc ERC20Upgradeable
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        require(!paused(), "ERC20Pausable: token transfer while paused");
        super._beforeTokenTransfer(from, to, amount);
    }

    /// @inheritdoc ERC20Upgradeable
    function _mint(address account, uint256 amount) internal override {
        require(
            totalSupply() + amount <= maxTotalSupply,
            "max total supply exceeds allowed"
        );
        super._mint(account, amount);
    }

    /// @inheritdoc IERC4626Upgradeable
    function totalAssets() public view override returns (uint256) {
        uint256 balance = IERC20MetadataUpgradeable(asset()).balanceOf(
            address(this)
        );
        IERC4626Upgradeable vault;
        uint256 count = getRoleMemberCount(VAULT_ROLE);
        for (uint8 i; i != count; ) {
            vault = IERC4626Upgradeable(getRoleMember(VAULT_ROLE, i));
            balance += vault.previewRedeem(vault.balanceOf(address(this)));
            unchecked {
                ++i;
            }
        }
        return balance;
    }

    /// @inheritdoc IERC4626Upgradeable
    function maxDeposit(address) public view override returns (uint256) {
        return
            paused()
                ? 0
                : _convertToAssets(
                    maxTotalSupply - totalSupply(),
                    MathUpgradeable.Rounding.Up
                );
    }

    /// @inheritdoc IERC4626Upgradeable
    function maxMint(address) public view override returns (uint256) {
        return paused() ? 0 : maxTotalSupply - totalSupply();
    }

    /// @inheritdoc IERC4626Upgradeable
    function maxWithdraw(address owner) public view override returns (uint256) {
        uint256 balance = IERC20MetadataUpgradeable(asset()).balanceOf(
            address(this)
        );
        return
            paused()
                ? 0
                : _convertToAssets(
                    balanceOf(owner),
                    MathUpgradeable.Rounding.Down
                ).min(balance);
    }

    /// @inheritdoc IERC4626Upgradeable
    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 balance = IERC20MetadataUpgradeable(asset()).balanceOf(
            address(this)
        );
        return
            paused()
                ? 0
                : balanceOf(owner).min(
                    _convertToShares(balance, MathUpgradeable.Rounding.Down)
                );
    }

    /// @inheritdoc IERC4626Upgradeable
    function previewWithdraw(uint256 assets)
        public
        view
        override
        returns (uint256)
    {
        return
            _convertToShares(
                assets.mulDiv(10_000, 10_000 - withdrawalFees),
                MathUpgradeable.Rounding.Up
            );
    }

    /// @inheritdoc IERC4626Upgradeable
    function previewRedeem(uint256 shares)
        public
        view
        override
        returns (uint256)
    {
        return
            _convertToAssets(
                shares.mulDiv(10_000 - withdrawalFees, 10_000),
                MathUpgradeable.Rounding.Down
            );
    }

    /// @inheritdoc ERC4626Upgradeable
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        address feesAddr1 = getRoleMember(ASSET_RECEIVER_ROLE, 0);
        address feesAddr2 = getRoleMember(SPICE_ROLE, 0);
        uint256 fees = _convertToAssets(shares, MathUpgradeable.Rounding.Down) -
            assets;
        uint256 fees1 = fees.div(2);

        super._withdraw(caller, receiver, owner, assets, shares);
        SafeERC20Upgradeable.safeTransfer(
            IERC20MetadataUpgradeable(asset()),
            feesAddr1,
            fees1
        );
        SafeERC20Upgradeable.safeTransfer(
            IERC20MetadataUpgradeable(asset()),
            feesAddr2,
            fees.sub(fees1)
        );
    }

    /// @inheritdoc ERC4626Upgradeable
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override {
        require(
            getRoleMemberCount(USER_ROLE) == 0 || hasRole(USER_ROLE, caller),
            "caller is not enabled"
        );
        super._deposit(caller, receiver, assets, shares);
    }

    function transfer(
        address vault,
        address to,
        uint256 amount
    ) public onlyRole(STRATEGIST_ROLE) returns (bool) {
        _checkRole(VAULT_ROLE, vault);
        _checkRole(VAULT_RECEIVER_ROLE, to);
        return IERC4626Upgradeable(vault).transfer(to, amount);
    }

    function transferFrom(
        address vault,
        address from,
        address to,
        uint256 amount
    ) public onlyRole(STRATEGIST_ROLE) returns (bool) {
        _checkRole(VAULT_ROLE, vault);
        _checkRole(VAULT_RECEIVER_ROLE, to);
        return IERC4626Upgradeable(vault).transferFrom(from, to, amount);
    }

    function approve(
        address vault,
        address spender,
        uint256 amount
    ) public onlyRole(STRATEGIST_ROLE) returns (bool) {
        _checkRole(VAULT_ROLE, vault);
        _checkRole(VAULT_RECEIVER_ROLE, spender);
        return IERC4626Upgradeable(vault).approve(spender, amount);
    }

    function approveAsset(
        address vault,
        uint256 amount
    ) public onlyRole(STRATEGIST_ROLE) returns (bool) {
        _checkRole(VAULT_ROLE, vault);
        return IERC20Upgradeable(asset()).approve(vault, amount);
    }

    function deposit(
        address vault,
        uint256 assets,
        address receiver
    ) public onlyRole(STRATEGIST_ROLE) returns (uint256 shares) {
        _checkRole(VAULT_ROLE, vault);
        _checkRole(VAULT_RECEIVER_ROLE, receiver);
        return IERC4626Upgradeable(vault).deposit(assets, receiver);
    }

    function mint(
        address vault,
        uint256 shares,
        address receiver
    ) public onlyRole(STRATEGIST_ROLE) returns (uint256 assets) {
        _checkRole(VAULT_ROLE, vault);
        _checkRole(VAULT_RECEIVER_ROLE, receiver);
        return IERC4626Upgradeable(vault).mint(shares, receiver);
    }

    function withdraw(
        address vault,
        uint256 assets,
        address receiver,
        address owner
    ) public onlyRole(STRATEGIST_ROLE) returns (uint256 shares) {
        _checkRole(VAULT_ROLE, vault);
        _checkRole(VAULT_RECEIVER_ROLE, receiver);
        return IERC4626Upgradeable(vault).withdraw(assets, receiver, owner);
    }

    function redeem(
        address vault,
        uint256 shares,
        address receiver,
        address owner
    ) public onlyRole(STRATEGIST_ROLE) returns (uint256 assets) {
        _checkRole(VAULT_ROLE, vault);
        _checkRole(VAULT_RECEIVER_ROLE, receiver);
        return IERC4626Upgradeable(vault).redeem(shares, receiver, owner);
    }
}
