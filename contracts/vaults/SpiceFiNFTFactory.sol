// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol";

/**
 * @title SpiceFiNFTFactory
 * @author Spice Finance Inc
 */
contract SpiceFiNFTFactory is AccessControlEnumerable {
    using StringsUpgradeable for uint256;

    /// @notice Beacon address
    address public immutable beacon;

    /// @notice Spice dev wallet
    address public dev;

    /// @notice Spice Multisig address
    address public multisig;

    /// @notice Fee recipient address
    address public feeRecipient;

    /*************/
    /* Constants */
    /*************/

    /// @notice Asset role
    bytes32 public constant ASSET_ROLE = keccak256("ASSET_ROLE");

    /// @notice Vault role
    bytes32 public constant VAULT_ROLE = keccak256("VAULT_ROLE");

    /// @notice Aggregator role
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

    /***************/
    /* Constructor */
    /***************/

    /// @notice Constructor
    /// @param _beacon Beacon address
    /// @param _dev Initial dev address
    /// @param _multisig Initial multisig address
    /// @param _feeRecipient Initial fee recipient address
    constructor(
        address _beacon,
        address _dev,
        address _multisig,
        address _feeRecipient
    ) {
        if (_beacon == address(0)) {
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

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        beacon = _beacon;
        dev = _dev;
        multisig = _multisig;
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

    /*************/
    /* Functions */
    /*************/

    /// @notice Creates new BeaconProxy for SpiceFi4626 vault
    /// @param _name Vault name
    /// @param _symbol Vault symbol
    /// @param _asset Asset address for the vault
    /// @param _mintPrice NFT mint price
    /// @param _maxSupply Max total supply
    /// @param _lending Lending contract address
    /// @param _vaults Default vault addresses
    /// @return vault Created vault address
    function createVault(
        string memory _name,
        string memory _symbol,
        address _asset,
        uint256 _mintPrice,
        uint256 _maxSupply,
        address _lending,
        address[] calldata _vaults
    ) external returns (address vault) {
        if (_asset == address(0)) {
            revert InvalidAddress();
        }
        if (_maxSupply == 0) {
            revert ParameterOutOfBounds();
        }
        if (_lending == address(0)) {
            revert InvalidAddress();
        }

        _checkRole(ASSET_ROLE, _asset);

        uint256 length = _vaults.length;
        for (uint256 i; i != length; ++i) {
            _checkRole(VAULT_ROLE, _vaults[i]);
        }

        vault = address(
            new BeaconProxy(
                beacon,
                abi.encodeWithSignature(
                    "initialize(string,string,address,uint256,uint256,address,address[],address,address,address,address)",
                    _name,
                    _symbol,
                    _asset,
                    _mintPrice,
                    _maxSupply,
                    _lending,
                    _vaults,
                    msg.sender,
                    dev,
                    multisig,
                    feeRecipient
                )
            )
        );

        // grant AGGREGATOR_ROLE for tracking
        _grantRole(AGGREGATOR_ROLE, address(vault));

        emit VaultCreated(msg.sender, vault);
    }
}
