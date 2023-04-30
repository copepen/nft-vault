// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import "../interfaces/IWETH.sol";
import "../interfaces/IMetaVault.sol";
import "../interfaces/IMetaLp.sol";
import "hardhat/console.sol";

/**
 * @title Storage for Meta4626
 * @author Spice Finance Inc
 */
abstract contract Meta4626Storage {
    /// @notice Metastreet vault address
    address public vaultAddress;

    /// @notice LpToken address
    address public lpTokenAddress;
}

/**
 * @title ERC4626 Wrapper for Metastreet
 * @author Spice Finance Inc
 */
contract Meta4626 is
    Meta4626Storage,
    Initializable,
    ERC20Upgradeable,
    ReentrancyGuardUpgradeable,
    AccessControlEnumerableUpgradeable
{
    using MathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /*************/
    /* Constants */
    /*************/

    /// @notice WETH address
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    /// @notice Whitelist role
    bytes32 public constant WHITELIST_ROLE = keccak256("WHITELIST_ROLE");

    /**********/
    /* Events */
    /**********/

    event Deposit(
        address indexed sender,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    event Withdraw(
        address indexed sender,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    /// @notice Emitted when totalAssets is updated
    /// @param totalAssets Total assets
    event TotalAssets(uint256 totalAssets);

    /**********/
    /* Errors */
    /**********/

    /// @notice Invalid address (e.g. zero address)
    error InvalidAddress();

    /// @notice Parameter out of bounds
    error ParameterOutOfBounds();

    /// @notice Not enough reward balance
    error NotEnoughRewardBalance();

    /***************/
    /* Constructor */
    /***************/

    /// @notice Meta4626 constructor (for proxy)
    /// @param name_ Receipt token name
    /// @param symbol_ Receipt token symbol
    /// @param vaultAddress_ Vault address
    function initialize(
        string calldata name_,
        string calldata symbol_,
        address vaultAddress_
    ) external initializer {
        if (vaultAddress_ == address(0)) {
            revert InvalidAddress();
        }

        __ERC20_init(name_, symbol_);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        vaultAddress = vaultAddress_;

        lpTokenAddress = IMetaVault(vaultAddress).lpToken(
            IMetaVault.TrancheId.Junior
        );
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /***********/
    /* Getters */
    /***********/

    /// @notice Get underlying token address
    function asset() external pure returns (address) {
        return WETH;
    }

    /// @notice See {IERC4626-totalAssets}
    function totalAssets() public view returns (uint256) {
        return
            IERC20Upgradeable(lpTokenAddress).balanceOf(address(this)).mulDiv(
                _redemptionSharePrice(),
                1e18,
                MathUpgradeable.Rounding.Down
            ) + IMetaLp(lpTokenAddress).redemptions(address(this)).pending;
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
            _convertToAssets(balanceOf(owner), MathUpgradeable.Rounding.Down);
    }

    /// @notice See {IERC4626-maxRedeem}
    function maxRedeem(address owner) external view returns (uint256) {
        return balanceOf(owner);
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

    /******************/
    /* User Functions */
    /******************/

    /// @notice Deposits weth into Bend pool and receive receipt tokens
    /// @param assets The amount of weth being deposited
    /// @param receiver The account that will receive the receipt tokens
    /// @return shares The amount of receipt tokens minted
    function deposit(
        uint256 assets,
        address receiver
    ) external nonReentrant onlyRole(WHITELIST_ROLE) returns (uint256 shares) {
        if (assets == 0) {
            revert ParameterOutOfBounds();
        }
        if (receiver == address(0)) {
            revert InvalidAddress();
        }

        shares = previewDeposit(assets);

        _deposit(assets, shares, receiver);
    }

    /// @notice Deposits weth into Bend pool and receive receipt tokens
    /// @param shares The amount of receipt tokens to mint
    /// @param receiver The account that will receive the receipt tokens
    /// @return assets The amount of weth deposited
    function mint(
        uint256 shares,
        address receiver
    ) external nonReentrant onlyRole(WHITELIST_ROLE) returns (uint256 assets) {
        if (shares == 0) {
            revert ParameterOutOfBounds();
        }
        if (receiver == address(0)) {
            revert InvalidAddress();
        }

        assets = previewMint(shares);

        _deposit(assets, shares, receiver);
    }

    /// @notice Withdraw weth from the pool
    /// @param assets The amount of weth being withdrawn
    /// @param receiver The account that will receive weth
    /// @param owner The account that will pay receipt tokens
    /// @return shares The amount of shares burnt
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external nonReentrant onlyRole(WHITELIST_ROLE) returns (uint256 shares) {
        if (receiver == address(0)) {
            revert InvalidAddress();
        }
        if (assets == 0) {
            revert ParameterOutOfBounds();
        }

        shares = previewWithdraw(assets);

        _withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /// @notice Withdraw weth from the pool
    /// @param shares The amount of receipt tokens being burnt
    /// @param receiver The account that will receive weth
    /// @param owner The account that will pay receipt tokens
    /// @return assets The amount of assets redeemed
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external nonReentrant onlyRole(WHITELIST_ROLE) returns (uint256 assets) {
        if (receiver == address(0)) {
            revert InvalidAddress();
        }
        if (shares == 0) {
            revert ParameterOutOfBounds();
        }

        assets = previewRedeem(shares);

        _withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /*****************************/
    /* Internal Helper Functions */
    /*****************************/

    /// @dev Current redemption share price on metastree vault
    /// @return sharePrice Current redemption share price
    function _redemptionSharePrice()
        internal
        view
        returns (uint256 sharePrice)
    {
        sharePrice = IMetaVault(vaultAddress).redemptionSharePrice(
            IMetaVault.TrancheId.Junior
        );
    }

    /// @dev Get estimated share amount for assets
    /// @param assets Asset token amount
    /// @param rounding Rounding mode
    /// @return shares Share amount
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

    /// @dev Get estimated share amount for assets
    /// @param shares Share amount
    /// @param rounding Rounding mode
    /// @return assets Asset token amount
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
        uint256 assets,
        uint256 shares,
        address receiver
    ) internal {
        // load weth
        IERC20Upgradeable weth = IERC20Upgradeable(WETH);

        // receive weth from msg.sender
        weth.safeTransferFrom(msg.sender, address(this), assets);

        // approve weth deposit into underlying marketplace
        weth.safeApprove(vaultAddress, 0);
        weth.safeApprove(vaultAddress, assets);

        // deposit into underlying marketplace
        IMetaVault(vaultAddress).deposit(IMetaVault.TrancheId.Junior, assets);

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
        // load weth
        IERC20Upgradeable weth = IERC20Upgradeable(WETH);

        IMetaLp.Redemption memory redemption = IMetaLp(lpTokenAddress).redemptions(address(this));
        uint256 missingAmount = assets <= redemption.pending ? 0 : assets - redemption.pending;
        if (missingAmount != 0) {
            // get lp token contract
            IERC20Upgradeable lpToken = IERC20Upgradeable(lpTokenAddress);

            uint256 redemptionSharePrice = _redemptionSharePrice();
            uint256 lpRedeemAmount = missingAmount.mulDiv(
                1e18,
                redemptionSharePrice,
                MathUpgradeable.Rounding.Up
            );

            lpToken.safeApprove(vaultAddress, 0);
            lpToken.safeApprove(vaultAddress, lpRedeemAmount);

            // withdraw weth from the pool and send it to `receiver`
            IMetaVault(vaultAddress).redeem(
                IMetaVault.TrancheId.Junior,
                lpRedeemAmount
            );
        }

        (, , , , uint256 processedRedemptionQueue, , ) = IMetaVault(
            vaultAddress
        ).trancheState(IMetaVault.TrancheId.Junior);

        uint256 available = IMetaLp(lpTokenAddress).redemptionAvailable(
            address(this),
            processedRedemptionQueue
        );

        shares = shares.mulDiv(
            available,
            assets,
            MathUpgradeable.Rounding.Down
        );
        if (available == assets + 1) {
            --shares;
        }
        assets = available;

        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }

        // Burn receipt tokens from owner
        _burn(owner, shares);

        IMetaVault(vaultAddress).withdraw(IMetaVault.TrancheId.Junior, assets);

        weth.safeTransfer(receiver, assets);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }
}
