// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "./SpiceFi4626.sol";

/**
 * @title SpiceFiFactory
 * @author Spice Finance Inc
 */
contract SpiceFiFactory is AccessControlEnumerable {
    using Clones for address;
    using StringsUpgradeable for uint256;

    /// @notice SpiceFi4626 implementation
    SpiceFi4626 public immutable implementation;

    /// @notice Spice dev wallet
    address public dev;

    /// @notice Spice Multisig address
    address public multisig;

    /// @notice Withdrawal fees per 10_000 units
    uint256 public withdrawalFees;

    /// @notice Fee recipient address
    address public feeRecipient;

    /*************/
    /* Constants */
    /*************/

    /// @notice Vault contracts
    bytes32 public constant ASSET_ROLE = keccak256("ASSET_ROLE");

    /// @notice Vault contracts
    bytes32 public constant VAULT_ROLE = keccak256("VAULT_ROLE");

    /// @notice Aggregator contracts
    bytes32 public constant AGGREGATOR_ROLE = keccak256("AGGREGATOR_ROLE");

    /**********/
    /* Errors */
    /**********/

    /// @notice Invalid address (e.g. zero address)
    error InvalidAddress();

    /// @notice Parameter out of bounds
    error ParameterOutOfBounds();

    /**********/
    /* Events */
    /**********/

    /// @notice Emitted when new vault is created
    /// @param owner Owner addres
    /// @param vault Vault address
    event VaultCreated(address indexed owner, address vault);

    /// @notice Emitted when dev is updated
    /// @param dev New dev address
    event DevUpdated(address dev);

    /// @notice Emitted when multisig is updated
    /// @param multisig New multisig address
    event MultisigUpdated(address multisig);

    /// @notice Emitted when fee recipient is updated
    /// @param feeRecipient New fee recipient address
    event FeeRecipientUpdated(address feeRecipient);

    /// @notice Emitted when withdrawal fee rate is updated
    /// @param withdrawalFees New withdrawal fees per 10_000 units
    event WithdrawalFeeRateUpdated(uint256 withdrawalFees);

    /***************/
    /* Constructor */
    /***************/

    /// @notice Constructor
    /// @param _implementation SpiceFi4626 implementation address
    /// @param _multisig Initial multisig address
    /// @param _feeRecipient Initial fee recipient address
    constructor(
        SpiceFi4626 _implementation,
        address _dev,
        address _multisig,
        uint256 _withdrawalFees,
        address _feeRecipient
    ) {
        if (address(_implementation) == address(0)) {
            revert InvalidAddress();
        }
        if (_dev == address(0)) {
            revert InvalidAddress();
        }
        if (_multisig == address(0)) {
            revert InvalidAddress();
        }
        if (_withdrawalFees > 10_000) {
            revert ParameterOutOfBounds();
        }
        if (_feeRecipient == address(0)) {
            revert InvalidAddress();
        }

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        implementation = _implementation;
        dev = _dev;
        multisig = _multisig;
        withdrawalFees = _withdrawalFees;
        feeRecipient = _feeRecipient;
    }

    /***********/
    /* Setters */
    /***********/

    /// @notice Set the dev wallet address
    ///
    /// Emits a {DevUpdated} event.
    ///
    /// @param _dev New dev wallet
    function setDev(address _dev) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_dev == address(0)) {
            revert InvalidAddress();
        }
        dev = _dev;
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

    /// @notice Set withdrawal fees
    ///
    /// Emits a {WithdrawalFeeRateUpdated} event.
    ///
    /// @param _withdrawalFees New withdrawal fees per 10_000 units
    function setWithdrawalFees(
        uint256 _withdrawalFees
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_withdrawalFees > 10_000) {
            revert ParameterOutOfBounds();
        }
        withdrawalFees = _withdrawalFees;
        emit WithdrawalFeeRateUpdated(_withdrawalFees);
    }

    /*************/
    /* Functions */
    /*************/

    /// @notice Creates new SpiceFi4626 vault
    /// @param asset Asset address for SpiceFi4626
    /// @param vaults Default vault addresses
    /// @return vault Created vault address
    function createVault(
        address asset,
        address[] calldata vaults
    ) external returns (SpiceFi4626 vault) {
        if (asset == address(0)) {
            revert InvalidAddress();
        }

        _checkRole(ASSET_ROLE, asset);

        uint256 length = vaults.length;
        for (uint256 i; i != length; ++i) {
            _checkRole(VAULT_ROLE, vaults[i]);
        }

        vault = SpiceFi4626(address(implementation).clone());

        // grant AGGREGATOR_ROLE for tracking
        _grantRole(AGGREGATOR_ROLE, address(vault));

        uint256 vaultId = getRoleMemberCount(AGGREGATOR_ROLE);
        vault.initialize(
            string(abi.encodePacked("Spice", vaultId.toString())),
            string(abi.encodePacked("s", vaultId.toString())),
            asset,
            vaults,
            msg.sender,
            dev,
            multisig,
            withdrawalFees,
            feeRecipient
        );

        emit VaultCreated(msg.sender, address(vault));
    }
}
