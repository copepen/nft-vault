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
import "../interfaces/INote.sol";

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

    /// @notice Lender Note
    INote public note;

    /// @notice Interest fee rate
    uint256 public interestFee;
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

    /// @notice Spice role
    bytes32 public constant SPICE_ROLE = keccak256("SPICE_ROLE");

    /// @notice EIP712 type hash for loan terms
    bytes32 private constant _LOAN_TERMS_TYPEHASH =
        keccak256(
            "LoanTerms(address collateralAddress,uint256 collateralId,uint256 principal,uint160 interestRate,uint32 duration,uint256 deadline,address lender,address borrower,address currency)"
        );

    /// @notice Interest denominator
    uint256 public constant DENOMINATOR = 10000;

    /// @notice Seconds per year
    uint256 public constant ONE_YEAR = 365 days;

    /**********/
    /* Errors */
    /**********/

    /// @notice LoanTerms expired
    error LoanTermsExpired();

    /// @notice Invalid address (e.g. zero address)
    error InvalidAddress();

    /// @notice Parameter out of bounds
    error ParameterOutOfBounds();

    /// @notice Invalid Signature
    error InvalidSignature();

    /// @notice Invalid Signer
    error InvalidSigner();

    /// @notice Invalid Loan State
    /// @param state Current loan state
    error InvalidState(LibLoan.LoanState state);

    /***************/
    /* Constructor */
    /***************/

    /// @notice SpiceLending constructor (for proxy)
    /// @param _signer Signer address
    /// @param _note Note contract address
    function initialize(
        address _signer,
        INote _note,
        uint256 _interestFee
    ) external initializer {
        if (_signer == address(0)) {
            revert InvalidAddress();
        }
        if (address(_note) == address(0)) {
            revert InvalidAddress();
        }
        if (_interestFee > DENOMINATOR) {
            revert ParameterOutOfBounds();
        }

        __EIP712_init("SpiceLending", "1");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        signer = _signer;
        note = _note;
        interestFee = _interestFee;
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

    /// @notice Set the interest fee rate
    ///
    /// Emits a {InterestFeeUpdated} event.
    ///
    /// @param _interestFee Interest fee rate
    function setInterestFee(uint256 _interestFee)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (_interestFee > DENOMINATOR) {
            revert ParameterOutOfBounds();
        }
        interestFee = _interestFee;

        emit InterestFeeUpdated(_interestFee);
    }

    /******************/
    /* User Functions */
    /******************/

    /// @notice See {ISpiceLending-initiateLoan}
    function initiateLoan(
        LibLoan.LoanTerms calldata _terms,
        bytes calldata _signature
    ) external nonReentrant returns (uint256 loanId) {
        // check loan terms expiration
        if (block.timestamp > _terms.deadline) {
            revert LoanTermsExpired();
        }

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
            interestAccrued: 0,
            repaidAt: block.timestamp
        });

        // mint notes
        _mintNote(loanId, _terms.lender);

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

    /// @notice See {ISpiceLending-partialRepay}
    function partialRepay(
        uint256 _loanId,
        uint256 _principalPayment,
        uint256 _interestPayment
    ) external nonReentrant {
        LibLoan.LoanData storage data = loans[_loanId];
        if (data.state != LibLoan.LoanState.Active) {
            revert InvalidState(data.state);
        }

        address lender = note.ownerOf(_loanId);
        address borrower = data.terms.borrower;

        if (_principalPayment > data.balance) {
            _principalPayment = data.balance;
        }

        // calc total interest to pay
        uint256 interestToPay = _calcInterest(data);
        if (_interestPayment > interestToPay) {
            _interestPayment = interestToPay;
        }

        /// update loan state
        data.balance -= _principalPayment;
        data.interestAccrued = interestToPay - _interestPayment;
        data.repaidAt = block.timestamp;

        IERC20Upgradeable currency = IERC20Upgradeable(data.terms.currency);
        currency.safeTransferFrom(
            borrower,
            address(this),
            _principalPayment + _interestPayment
        );

        uint256 fee = (_interestPayment * interestFee) / DENOMINATOR;
        currency.safeTransfer(
            lender,
            _principalPayment + _interestPayment - fee
        );

        address feesAddr = getRoleMember(SPICE_ROLE, 0);
        if (feesAddr != address(0)) {
            currency.safeTransfer(feesAddr, fee);
        }

        emit LoanRepaid(_loanId);
    }

    /**********************/
    /* Internal Functions */
    /**********************/

    /// @dev Mints new note
    /// @param _loanId Loan ID
    /// @param _lender Lender address to receive note
    function _mintNote(uint256 _loanId, address _lender) internal {
        note.mint(_lender, _loanId);
    }

    /// @dev Calc total interest to pay
    ///      Total Interest = Interest Accrued + New Interest since last repayment
    /// @param _data Loan data
    /// @return interest Total interest
    function _calcInterest(LibLoan.LoanData storage _data)
        internal
        view
        returns (uint256 interest)
    {
        uint256 timeElapsed = block.timestamp - _data.repaidAt;
        uint256 newInterest = (_data.balance *
            _data.terms.interestRate *
            timeElapsed) /
            DENOMINATOR /
            ONE_YEAR;

        return _data.interestAccrued + newInterest;
    }
}
