// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

import "../interfaces/ISpiceLending.sol";

/**
 * @title Storage for SpiceLending
 * @author Spice Finance Inc
 */
abstract contract SpiceLendingStorage {
    /// @notice signer address used to sign loan terms
    address public signer;

    /// @notice loan id tracker
    CountersUpgradeable.Counter internal loanIdTracker;

    /// @notice keep track of loans
    mapping(uint256 => LibLoan.LoanData) internal loans;
}

/**
 * @title SpiceLending
 * @author Spice Finance Inc
 */
contract SpiceLending is
    ISpiceLending,
    SpiceLendingStorage,
    Initializable,
    UUPSUpgradeable,
    AccessControlEnumerableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    EIP712Upgradeable,
    ERC721Holder
{
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /*************/
    /* Constants */
    /*************/

    /// @notice EIP712 type hash for loan terms
    bytes32 private constant _LOAN_TERMS_TYPEHASH =
        keccak256(
            "LoanTerms(address collateralAddress,uint256 collateralId,uint256 principal,uint160 interestRate,uint32 duration,uint32 deadline,address lender,address borrower,address currency)"
        );

    /**********/
    /* Errors */
    /**********/

    /// @notice Invalid address (e.g. zero address)
    error InvalidAddress();

    /// @notice Invalid Signature
    error InvalidSignature();

    /// @notice Invalid Signer
    error InvalidSigner();

    /***************/
    /* Constructor */
    /***************/

    /// @notice SpiceLending constructor (for proxy)
    /// @param _signer signer address
    function initialize(address _signer) external initializer {
        if (_signer == address(0)) {
            revert InvalidAddress();
        }

        __EIP712_init("SpiceLending", "1");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        signer = _signer;
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address _newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {}

    /***********/
    /* Setters */
    /***********/

    /// @notice set new signer
    /// @param _newSigner new signer address
    function setSigner(address _newSigner)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (_newSigner == address(0)) {
            revert InvalidAddress();
        }

        signer = _newSigner;
    }

    /******************/
    /* User Functions */
    /******************/

    /// @notice See {ISpiceLending-initiateLoan}
    function initiateLoan(
        LibLoan.LoanTerms calldata _terms,
        bytes calldata _signature
    ) external returns (uint256 loanId) {
        // get current loanId and increment for next function call
        loanId = loanIdTracker.current();
        loanIdTracker.increment();

        // check if the loan terms is signed by signer
        bytes32 termsHash = keccak256(
            abi.encode(
                _LOAN_TERMS_TYPEHASH,
                _terms.collateralAddress,
                _terms.collateralId,
                _terms.principal,
                _terms.interestRate,
                _terms.duration,
                _terms.deadline,
                _terms.lender,
                _terms.borrower,
                _terms.currency
            )
        );
        bytes32 hash = _hashTypedDataV4(termsHash);
        address recoveredSigner = ECDSA.recover(hash, _signature);
        if (recoveredSigner != signer) {
            revert InvalidSignature();
        }

        if (signer != _terms.lender) {
            bytes4 magicValue = IERC1271(_terms.lender).isValidSignature(
                hash,
                _signature
            );
            // bytes4(keccak256("isValidSignature(bytes32,bytes)"))
            if (magicValue != 0x1626ba7e) {
                revert InvalidSigner();
            }
        }

        // initiate new loan
        loans[loanId] = LibLoan.LoanData({
            state: LibLoan.LoanState.Active,
            terms: _terms,
            startedAt: block.timestamp,
            balance: _terms.principal,
            balancePaid: 0,
            feesAccrued: 0
        });

        IERC721Upgradeable(_terms.collateralAddress).safeTransferFrom(
            msg.sender,
            address(this),
            _terms.collateralId
        );
        IERC20Upgradeable(_terms.currency).safeTransferFrom(
            _terms.lender,
            msg.sender,
            _terms.principal
        );

        emit LoanStarted(loanId, msg.sender);
    }
}
