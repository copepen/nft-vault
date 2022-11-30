// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "./SpiceFi4626.sol";

/// @title SpiceFi Factory
contract SpiceFiFactory is AccessControlEnumerable {
    using Clones for address;

    /// @notice SpiceFi4626 implementation
    SpiceFi4626 public immutable implementation;

    /////////////////////////////////////////////////////////////////////////
    /// Constants ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Vault contracts
    bytes32 public constant VAULT_ROLE = keccak256("VAULT_ROLE");

    /// @notice Aggregator contracts
    bytes32 public constant AGGREGATOR_ROLE = keccak256("AGGREGATOR_ROLE");

    /////////////////////////////////////////////////////////////////////////
    /// Errors ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Invalid address (e.g. zero address)
    error InvalidAddress();

    /// @notice Parameter out of bounds
    error ParameterOutOfBounds();

    /////////////////////////////////////////////////////////////////////////
    /// Events ///
    /////////////////////////////////////////////////////////////////////////

    /// @notice Emitted when new vault is created
    /// @param owner Owner addres
    /// @param vault Vault address
    event VaultCreated(address indexed owner, address vault);

    /// @notice Constructor
    /// @param implementation_ SpiceFi4626 implementation address
    constructor(SpiceFi4626 implementation_) {
        if (address(implementation_) == address(0)) {
            revert InvalidAddress();
        }

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        implementation = implementation_;
    }

    /// @notice Creates new SpiceFi4626 vault
    /// @param asset Asset address for SpiceFi4626
    /// @param assetReceiver Default asset receiver
    /// @param vaults Default vault addresses
    /// @param withdrawalFees Default withdrawal fees
    /// @return vault Created vault address
    function createVault(
        address asset,
        address assetReceiver,
        address[] calldata vaults,
        uint256 withdrawalFees
    ) external returns (SpiceFi4626 vault) {
        if (asset == address(0)) {
            revert InvalidAddress();
        }
        if (assetReceiver == address(0)) {
            revert InvalidAddress();
        }

        vault = SpiceFi4626(address(implementation).clone());
        vault.initialize(asset, msg.sender, assetReceiver, withdrawalFees);

        uint256 length = vaults.length;
        bytes32 VAULT_ROLE_ = vault.VAULT_ROLE();

        for (uint256 i; i != length; ) {
            _checkRole(VAULT_ROLE, vaults[i]);
            vault.grantRole(VAULT_ROLE_, vaults[i]);

            unchecked {
                ++i;
            }
        }

        // grant AGGREGATOR_ROLE for tracking
        _grantRole(AGGREGATOR_ROLE, address(vault));

        emit VaultCreated(msg.sender, address(vault));
    }
}
