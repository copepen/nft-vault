// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "./SFMulticallUpgradeable.sol";

contract SpiceFi4626 is
    ERC4626Upgradeable,
    PausableUpgradeable,
    AccessControlEnumerableUpgradeable,
    UUPSUpgradeable,
    SFMulticallUpgradeable
{
    using MathUpgradeable for uint256;

    /// @dev rebalances vault assets using ERC4626 client interface
    bytes32 public constant STRATEGIST_ROLE = keccak256("STRATEGIST_ROLE");
    /// @dev contracts that funds can be sent to
    bytes32 public constant VAULT_ROLE = keccak256("VAULT_ROLE");
    /// @dev contracts that can be listed as "receiver" of shares in ERC4626 client calls
    bytes32 public constant VAULT_RECEIVER_ROLE =
        keccak256("VAULT_RECEIVER_ROLE");
    /// @dev contracts that receive fees
    bytes32 public constant ASSET_RECEIVER_ROLE =
        keccak256("ASSET_RECEIVER_ROLE");
    /// @dev contracts allowed to deposit
    bytes32 public constant USER_ROLE = keccak256("USER_ROLE");

    /// @dev storage
    /// @notice withdrawal fees per 10_000 units
    uint256 public withdrawalFees;
    uint256 public maxTotalSupply;

    /// @notice initialize proxy
    function initialize(address asset_) public initializer {
        __ERC4626_init(IERC20MetadataUpgradeable(asset_));
        __ERC20_init("SpiceToken", "SPICE");
        withdrawalFees = 700;
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(
            DEFAULT_ADMIN_ROLE,
            address(0x7B15f2B26C25e1815Dc4FB8957cE76a0C5319582)
        );
        _setupRole(USER_ROLE, _msgSender());
        _setupRole(ASSET_RECEIVER_ROLE, _msgSender());
        _setupRole(VAULT_RECEIVER_ROLE, address(this));
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
        for (uint8 i = 0; i < getRoleMemberCount(VAULT_ROLE); i++) {
            vault = IERC4626Upgradeable(getRoleMember(VAULT_ROLE, i));
            balance += vault.previewRedeem(vault.balanceOf(address(this)));
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
                assets.mulDiv(10_000 + withdrawalFees, 10_000),
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
        address feesAddr = getRoleMember(ASSET_RECEIVER_ROLE, 0);
        uint256 fees = _convertToAssets(shares, MathUpgradeable.Rounding.Down) -
            assets;
        super._withdraw(caller, receiver, owner, assets, shares);
        SafeERC20Upgradeable.safeTransfer(
            IERC20MetadataUpgradeable(asset()),
            feesAddr,
            fees
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

    function approve(
        address vault,
        address spender,
        uint256 amount
    ) public onlyRole(STRATEGIST_ROLE) returns (bool) {
        _checkRole(VAULT_ROLE, vault);
        _checkRole(VAULT_RECEIVER_ROLE, spender);
        return IERC4626Upgradeable(vault).approve(spender, amount);
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
