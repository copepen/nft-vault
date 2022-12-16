// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

import "../interfaces/INote.sol";

/**
 * @title Note
 * @author Spice Finance Inc
 */
contract Note is ERC721, AccessControlEnumerable, INote {
    /***********/
    /* Storage */
    /***********/

    /// @notice Owner address
    address public owner;

    /// @dev Note can be initialized only once
    bool private initialized;

    /*************/
    /* Constants */
    /*************/

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /**********/
    /* Errors */
    /**********/

    /// @notice Already Initialized
    error AlreadyInitialized();

    /// @notice Not Owner
    error NotOwner();

    /// @notice Missing Role
    error MissingRole();

    /// @notice Non Transferable
    error NonTransferable();

    /***************/
    /* Constructor */
    /***************/

    /// @notice Note Constructor
    /// @param _name The token name
    /// @param _symbol The token symbol
    constructor(string memory _name, string memory _symbol)
        ERC721(_name, _symbol)
    {
        owner = msg.sender;
    }

    /// @notice Initialize Note contract. Grants owner access to the lending contract.
    /// @dev Admin role is immutable once set and cannot be updated.
    /// @param _lending The lending contract address
    function initialize(address _lending) external {
        if (initialized) revert AlreadyInitialized();
        if (_msgSender() != owner) revert NotOwner();

        _setupRole(ADMIN_ROLE, _lending);
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);

        owner = _lending;
        initialized = true;
    }

    /********************/
    /* Token Operations */
    /********************/

    /// @notice Mints new note to user
    /// @param to The recipient address to receive note
    /// @param tokenId The note ID to mint
    function mint(address to, uint256 tokenId) external returns (uint256) {
        if (!hasRole(ADMIN_ROLE, _msgSender())) revert MissingRole();
        _mint(to, tokenId);

        return tokenId;
    }

    /// @notice Burn note
    /// @param tokenId The note ID to burn
    function burn(uint256 tokenId) external {
        if (!hasRole(ADMIN_ROLE, _msgSender())) revert MissingRole();
        _burn(tokenId);
    }

    /*************/
    /* Overrides */
    /*************/

    /// @dev See {IERC165-supportsInterface}.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControlEnumerable, ERC721, IERC165)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
