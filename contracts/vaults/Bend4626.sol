// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import "../interfaces/IWETH.sol";
import "../interfaces/IBendLendPool.sol";

/// @title Storage for Bend4626
abstract contract Bend4626Storage {
    /// @notice LendPool address
    address public poolAddress;

    /// @notice BToken address
    address public lpTokenAddress;

    /// @dev Token decimals
    uint8 internal _decimals;
}

/// @title ERC4626 Wrapper for BendLendPool
contract Bend4626 is
    Initializable,
    ERC20Upgradeable,
    ReentrancyGuardUpgradeable,
    Bend4626Storage
{
    using MathUpgradeable for uint256;

    /////////////////////////////////////////////////////////////////////////
    /// Constants ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice WETH address
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    uint256 public constant ONE_RAY = 1e27;

    /////////////////////////////////////////////////////////////////////////
    /// Events ///
    /////////////////////////////////////////////////////////////////////////

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

    /////////////////////////////////////////////////////////////////////////
    /// Errors ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Invalid address (e.g. zero address)
    error InvalidAddress();

    /// @notice Parameter out of bounds
    error ParameterOutOfBounds();

    /// @notice Slippage too high
    error SlippageTooHigh();

    /////////////////////////////////////////////////////////////////////////
    /// Constructor ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Bend4626 constructor (for proxy)
    /// @param name_ Receipt token name
    /// @param symbol_ Receipt token symbol
    /// @param poolAddress_ LendPool address
    /// @param lpTokenAddress_ BToken address
    function initialize(
        string calldata name_,
        string calldata symbol_,
        address poolAddress_,
        address lpTokenAddress_
    ) external initializer {
        if (poolAddress_ == address(0)) {
            revert InvalidAddress();
        }
        if (lpTokenAddress_ == address(0)) {
            revert InvalidAddress();
        }

        __ERC20_init(name_, symbol_);

        poolAddress = poolAddress_;

        uint8 decimals_;
        try
            IERC20MetadataUpgradeable(address(lpTokenAddress_)).decimals()
        returns (uint8 value) {
            decimals_ = value;
        } catch {
            decimals_ = super.decimals();
        }

        lpTokenAddress = lpTokenAddress_;
        _decimals = decimals_;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /////////////////////////////////////////////////////////////////////////
    /// Getters ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice See {IERC20Metadata-decimals}.
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Get underlying token address
    function asset() external pure returns (address) {
        return WETH;
    }

    /// @notice See {IERC4626-totalAssets}
    function totalAssets() public view returns (uint256) {
        return IERC20Upgradeable(lpTokenAddress).balanceOf(address(this));
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

    /////////////////////////////////////////////////////////////////////////
    /// User Functions ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Deposits weth into Bend pool and receive receipt tokens
    /// @param assets The amount of weth being deposited
    /// @param sharesMin The minimum amount of shares to receive
    /// @param receiver The account that will receive the receipt tokens
    /// @return shares The amount of receipt tokens minted
    function deposit(
        uint256 assets,
        uint256 sharesMin,
        address receiver
    ) external nonReentrant returns (uint256 shares) {
        if (assets == 0) {
            revert ParameterOutOfBounds();
        }
        if (receiver == address(0)) {
            revert InvalidAddress();
        }

        shares = previewDeposit(assets);

        if (sharesMin > shares) {
            revert SlippageTooHigh();
        }

        _deposit(assets, shares, receiver);
    }

    /// @notice Deposits weth into Bend pool and receive receipt tokens
    /// @param shares The amount of receipt tokens to mint
    /// @param assetsMax The maximum amount of assets to deposit
    /// @param receiver The account that will receive the receipt tokens
    /// @return assets The amount of weth deposited
    function mint(
        uint256 shares,
        uint256 assetsMax,
        address receiver
    ) external nonReentrant returns (uint256 assets) {
        if (shares == 0) {
            revert ParameterOutOfBounds();
        }
        if (receiver == address(0)) {
            revert InvalidAddress();
        }

        assets = previewMint(shares);

        if (assetsMax < assets) {
            revert SlippageTooHigh();
        }

        _deposit(assets, shares, receiver);
    }

    /// @notice Withdraw weth from the pool
    /// @param assets The amount of weth being withdrawn
    /// @param sharesMax The maximum amount of shares to burn
    /// @param receiver The account that will receive weth
    /// @param owner The account that will pay receipt tokens
    function withdraw(
        uint256 assets,
        uint256 sharesMax,
        address receiver,
        address owner
    ) external nonReentrant returns (uint256 shares) {
        if (receiver == address(0)) {
            revert InvalidAddress();
        }
        if (assets == 0) {
            revert ParameterOutOfBounds();
        }

        shares = previewWithdraw(assets);

        if (sharesMax < shares) {
            revert SlippageTooHigh();
        }

        _withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /// @notice Withdraw weth from the pool
    /// @param shares The amount of receipt tokens being burnt
    /// @param assetsMin The minimum amount of assets to redeem
    /// @param receiver The account that will receive weth
    /// @param owner The account that will pay receipt tokens
    function redeem(
        uint256 shares,
        uint256 assetsMin,
        address receiver,
        address owner
    ) external nonReentrant returns (uint256 assets) {
        if (receiver == address(0)) {
            revert InvalidAddress();
        }
        if (shares == 0) {
            revert ParameterOutOfBounds();
        }

        assets = previewRedeem(shares);

        if (assetsMin > assets) {
            revert SlippageTooHigh();
        }

        _withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /////////////////////////////////////////////////////////////////////////
    /// Internal Helper Functions ///
    /////////////////////////////////////////////////////////////////////////

    /// @dev Get estimated share amount for assets
    /// @param assets Asset token amount
    /// @param rounding Rounding mode
    /// @return shares Share amount
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

    /// @dev Get estimated share amount for assets
    /// @param shares Share amount
    /// @param rounding Rounding mode
    /// @return assets Asset token amount
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
        // load weth
        IWETH weth = IWETH(WETH);

        // receive weth from msg.sender
        weth.transferFrom(msg.sender, address(this), assets);

        // approve weth deposit into underlying marketplace
        weth.approve(poolAddress, assets);

        // deposit into underlying marketplace
        IBendLendPool(poolAddress).deposit(WETH, assets, address(this), 0);

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

        // Burn receipt tokens from owner
        _burn(owner, shares);

        // get lp token contract
        IERC20Upgradeable bToken = IERC20Upgradeable(lpTokenAddress);

        // approve AToken's withdraw from the pool
        bToken.approve(poolAddress, assets);

        // withdraw weth from the pool and send it to `receiver`
        IBendLendPool(poolAddress).withdraw(WETH, assets, receiver);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }
}
