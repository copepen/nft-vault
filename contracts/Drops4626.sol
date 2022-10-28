// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "prb-math/contracts/PRBMathUD60x18.sol";

import "./interfaces/IWETH.sol";
import "./interfaces/ICEther.sol";

/// @title Storage for Drops4626
abstract contract Drops4626Storage {
    /// @notice CEther address
    address public lpTokenAddress;

    /// @dev Token decimals
    uint8 internal _decimals;
}

/// @title ERC4626 Wrapper for Drops CEther
contract Drops4626 is
    Initializable,
    ERC20Upgradeable,
    IERC4626Upgradeable,
    Drops4626Storage
{
    /////////////////////////////////////////////////////////////////////////
    /// Constants ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice WETH address
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

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

    /// @notice Drops4626 constructor (for proxy)
    /// @param name_ Receipt token name
    /// @param symbol_ Receipt token symbol
    /// @param lpTokenAddress_ BToken address
    function initialize(
        string calldata name_,
        string calldata symbol_,
        address lpTokenAddress_
    ) external initializer {
        if (lpTokenAddress_ == address(0)) revert InvalidAddress();

        __ERC20_init(name_, symbol_);

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

    /// @notice Get underlying token address
    function asset() external pure returns (address) {
        return WETH;
    }

    /// @notice See {IERC4626-totalAssets}
    function totalAssets() external view returns (uint256) {
        return _convertToAssets(totalSupply());
    }

    /// @notice See {IERC4626-convertToShares}
    function convertToShares(uint256 assets) external view returns (uint256) {
        return _convertToShares(assets);
    }

    /// @notice See {IERC4626-convertToAssets}
    function convertToAssets(uint256 shares) external view returns (uint256) {
        return _convertToAssets(shares);
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
        return _convertToAssets(balanceOf(owner));
    }

    /// @notice See {IERC4626-maxRedeem}
    function maxRedeem(address owner) external view returns (uint256) {
        return balanceOf(owner);
    }

    /// @notice See {IERC4626-previewDeposit}
    function previewDeposit(uint256 assets) external view returns (uint256) {
        return _convertToShares(assets);
    }

    /// @notice See {IERC4626-previewMint}
    function previewMint(uint256 shares) external view returns (uint256) {
        return _convertToAssets(shares);
    }

    /// @notice See {IERC4626-previewWithdraw}
    function previewWithdraw(uint256 assets) external view returns (uint256) {
        return _convertToShares(assets);
    }

    /// @notice See {IERC4626-previewRedeem}
    function previewRedeem(uint256 shares) external view returns (uint256) {
        return _convertToAssets(shares);
    }

    /////////////////////////////////////////////////////////////////////////
    /// User Functions ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Deposits weth into CEther and receive receipt tokens
    /// @param assets The amount of weth being deposited
    /// @param receiver The account that will receive the receipt tokens
    /// @return shares The amount of receipt tokens minted
    function deposit(uint256 assets, address receiver)
        external
        returns (uint256 shares)
    {
        if (assets == 0) revert ParameterOutOfBounds();

        shares = _convertToShares(assets);

        _deposit(assets, shares, receiver);
    }

    /// @notice Deposits weth into CEther and receive receipt tokens
    /// @param shares The amount of receipt tokens to mint
    /// @param receiver The account that will receive the receipt tokens
    /// @return assets The amount of weth deposited
    function mint(uint256 shares, address receiver)
        external
        returns (uint256 assets)
    {
        if (shares == 0) revert ParameterOutOfBounds();

        assets = _convertToAssets(shares);

        _deposit(assets, shares, receiver);
    }

    /// @notice Withdraw weth from the pool
    /// @param assets The amount of weth being withdrawn
    /// @param receiver The account that will receive weth
    /// @param owner The account that will pay receipt tokens
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external returns (uint256 shares) {
        if (receiver == address(0)) revert InvalidAddress();
        if (assets == 0) revert ParameterOutOfBounds();

        shares = _convertToShares(assets);

        _withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /// @notice Withdraw weth from the pool
    /// @param shares The amount of receipt tokens being burnt
    /// @param receiver The account that will receive weth
    /// @param owner The account that will pay receipt tokens
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external returns (uint256 assets) {
        if (receiver == address(0)) revert InvalidAddress();
        if (shares == 0) revert ParameterOutOfBounds();

        assets = _convertToAssets(shares);

        _withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /////////////////////////////////////////////////////////////////////////
    /// Internal Helper Functions ///
    /////////////////////////////////////////////////////////////////////////

    /// @dev Get estimated share amount for assets
    /// @param assets Asset token amount
    /// @return shares Share amount
    function _convertToShares(uint256 assets)
        internal
        view
        returns (uint256 shares)
    {
        uint256 exchangeRate = _getExchangeRate();

        shares = PRBMathUD60x18.div(
            PRBMathUD60x18.mul(assets, 1e10),
            exchangeRate
        );
    }

    /// @dev Get estimated share amount for assets
    /// @param shares Share amount
    /// @return assets Asset token amount
    function _convertToAssets(uint256 shares)
        internal
        view
        returns (uint256 assets)
    {
        uint256 exchangeRate = _getExchangeRate();

        assets = PRBMathUD60x18.div(
            PRBMathUD60x18.mul(shares, exchangeRate),
            1e10
        );
    }

    /// @dev Get Exchange Rate
    function _getExchangeRate() internal view returns (uint256) {
        return ICEther(lpTokenAddress).exchangeRateStored();
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

        // transfer weth to eth
        weth.withdraw(assets);

        // get cether contract
        ICEther cEther = ICEther(lpTokenAddress);

        // mint ctoken
        cEther.mint{value: assets}();

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

        // load weth
        IWETH weth = IWETH(WETH);

        // get cether contract
        ICEther cEther = ICEther(lpTokenAddress);

        // trade ctokens for eth
        cEther.redeem(shares);

        // trade eth from weth
        weth.deposit{value: assets}();

        // transfer weth to receiver
        weth.transfer(receiver, assets);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }
}