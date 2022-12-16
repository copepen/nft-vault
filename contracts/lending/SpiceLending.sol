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
import "../interfaces/ISpiceFiNFT4626.sol";

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

    /// @notice Spice NFT role
    bytes32 public constant SPICE_NFT_ROLE = keccak256("SPICE_NFT_ROLE");

    /// @notice Interest denominator
    uint256 public constant DENOMINATOR = 10000;

    /// @notice Seconds per year
    uint256 public constant ONE_YEAR = 365 days;

    /**********/
    /* Errors */
    /**********/

    /// @notice LoanTerms expired
    error LoanTermsExpired();

    /// @notice Invalid loan terms
    error InvalidLoanTerms();

    /// @notice Invalid address (e.g. zero address)
    error InvalidAddress();

    /// @notice Parameter out of bounds
    error ParameterOutOfBounds();

    /// @notice Invalid Signature
    error InvalidSignature();

    /// @notice Invalid Signer
    error InvalidSigner();

    /// @notice Invalid msg.sender
    error InvalidMsgSender();

    /// @notice Invalid Loan State
    /// @param state Current loan state
    error InvalidState(LibLoan.LoanState state);

    /// @notice Loan Ended
    error LoanNotEnded();

    /*************/
    /* Modifiers */
    /*************/

    modifier updateInterest(uint256 _loanId) {
        // get loan data
        LibLoan.LoanData storage data = loans[_loanId];

        // update interestAccrued and updatedAt
        data.interestAccrued = _calcInterest(data);
        data.updatedAt = block.timestamp;

        _;
    }

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
        if (block.timestamp > _terms.baseTerms.expiration) {
            revert LoanTermsExpired();
        }

        _verifyLoanTermsSignature(_terms, _signature);

        // get current loanId and increment for next function call
        loanId = loanIdTracker.current();
        loanIdTracker.increment();

        // initiate new loan
        loans[loanId] = LibLoan.LoanData({
            state: LibLoan.LoanState.Active,
            terms: _terms,
            startedAt: block.timestamp,
            balance: _terms.principal,
            interestAccrued: 0,
            updatedAt: block.timestamp
        });

        // mint notes
        _mintNote(loanId, _terms.baseTerms.lender);

        IERC721Upgradeable(_terms.baseTerms.collateralAddress).safeTransferFrom(
                msg.sender,
                address(this),
                _terms.baseTerms.collateralId
            );

        IERC20Upgradeable(_terms.currency).safeTransferFrom(
            _terms.baseTerms.lender,
            msg.sender,
            _terms.principal
        );

        emit LoanStarted(loanId, msg.sender);
    }

    /// @notice See {ISpiceLending-partialRepay}
    function partialRepay(uint256 _loanId, uint256 _payment)
        external
        nonReentrant
    {
        LibLoan.LoanData storage data = loans[_loanId];
        if (data.state != LibLoan.LoanState.Active) {
            revert InvalidState(data.state);
        }

        address lender = note.ownerOf(_loanId);
        address borrower = data.terms.baseTerms.borrower;

        if (msg.sender != borrower) {
            revert InvalidMsgSender();
        }

        // calc total interest to pay
        uint256 interestToPay = _calcInterest(data);
        uint256 totalAmountToPay = data.balance + interestToPay;

        if (_payment > totalAmountToPay) {
            _payment = totalAmountToPay;
        }

        uint256 interestPayment;
        uint256 principalPayment;
        if (_payment > interestToPay) {
            interestPayment = interestToPay;
            principalPayment = _payment - interestToPay;
        } else {
            interestPayment = _payment;
        }

        // update loan data
        data.balance -= principalPayment;
        data.interestAccrued = interestToPay - interestPayment;
        data.updatedAt = block.timestamp;

        IERC20Upgradeable currency = IERC20Upgradeable(data.terms.currency);

        _transferRepayment(
            data.terms.baseTerms.collateralAddress,
            data.terms.baseTerms.collateralId,
            address(currency),
            borrower,
            _payment
        );

        uint256 fee = (interestPayment * interestFee) / DENOMINATOR;
        currency.safeTransfer(lender, _payment - fee);

        address feesAddr = getRoleMember(SPICE_ROLE, 0);
        if (feesAddr != address(0)) {
            currency.safeTransfer(feesAddr, fee);
        }

        // if loan is fully repaid
        if (_payment == totalAmountToPay) {
            data.state = LibLoan.LoanState.Repaid;

            // burn lender note
            note.burn(_loanId);

            // return collateral NFT to borrower
            IERC721Upgradeable(data.terms.baseTerms.collateralAddress)
                .safeTransferFrom(
                    address(this),
                    borrower,
                    data.terms.baseTerms.collateralId
                );
        }

        emit LoanRepaid(_loanId);
    }

    /// @notice See {ISpiceLending-repay}
    function repay(uint256 _loanId) external nonReentrant {
        LibLoan.LoanData storage data = loans[_loanId];
        if (data.state != LibLoan.LoanState.Active) {
            revert InvalidState(data.state);
        }

        // update loan state to Repaid
        data.state = LibLoan.LoanState.Repaid;

        address lender = note.ownerOf(_loanId);
        address borrower = data.terms.baseTerms.borrower;

        if (msg.sender != borrower) {
            revert InvalidMsgSender();
        }

        // calc total interest to pay
        uint256 interestToPay = _calcInterest(data);
        uint256 payment = data.balance + interestToPay;

        // update loan data
        delete data.balance;
        delete data.interestAccrued;
        data.updatedAt = block.timestamp;

        IERC20Upgradeable currency = IERC20Upgradeable(data.terms.currency);

        _transferRepayment(
            data.terms.baseTerms.collateralAddress,
            data.terms.baseTerms.collateralId,
            address(currency),
            borrower,
            payment
        );

        uint256 fee = (interestToPay * interestFee) / DENOMINATOR;
        currency.safeTransfer(lender, payment - fee);

        address feesAddr = getRoleMember(SPICE_ROLE, 0);
        if (feesAddr != address(0)) {
            currency.safeTransfer(feesAddr, fee);
        }

        // burn lender note
        note.burn(_loanId);

        // return collateral NFT to borrower
        IERC721Upgradeable(data.terms.baseTerms.collateralAddress)
            .safeTransferFrom(
                address(this),
                borrower,
                data.terms.baseTerms.collateralId
            );

        emit LoanRepaid(_loanId);
    }

    /// @notice See {ISpiceLending-extendLoan}
    function extendLoan(
        uint256 _loanId,
        LibLoan.ExtendLoanTerms calldata _terms,
        bytes calldata _signature
    ) external nonReentrant updateInterest(_loanId) {
        LibLoan.LoanData storage data = loans[_loanId];
        if (data.state != LibLoan.LoanState.Active) {
            revert InvalidState(data.state);
        }

        if (msg.sender != data.terms.baseTerms.borrower) {
            revert InvalidMsgSender();
        }

        _verifyExtendLoanTermsSignature(_terms, _signature);
        _validateBaseTerms(data.terms.baseTerms, _terms.baseTerms);

        data.terms.principal += _terms.additionalPrincipal;
        data.balance += _terms.additionalPrincipal;
        data.terms.interestRate = _terms.newInterestRate;
        data.terms.duration += _terms.additionalDuration;

        IERC20Upgradeable(data.terms.currency).safeTransferFrom(
            note.ownerOf(_loanId),
            msg.sender,
            _terms.additionalPrincipal
        );

        emit LoanExtended(_loanId);
    }

    /// @notice See {ISpiceLending-increaseLoan}
    function increaseLoan(
        uint256 _loanId,
        LibLoan.IncreaseLoanTerms calldata _terms,
        bytes calldata _signature
    ) external nonReentrant updateInterest(_loanId) {
        LibLoan.LoanData storage data = loans[_loanId];
        if (data.state != LibLoan.LoanState.Active) {
            revert InvalidState(data.state);
        }

        if (msg.sender != data.terms.baseTerms.borrower) {
            revert InvalidMsgSender();
        }

        _verifyIncreaseLoanTermsSignature(_terms, _signature);
        _validateBaseTerms(data.terms.baseTerms, _terms.baseTerms);

        data.terms.principal += _terms.additionalPrincipal;
        data.balance += _terms.additionalPrincipal;
        data.terms.interestRate = _terms.newInterestRate;

        IERC20Upgradeable(data.terms.currency).safeTransferFrom(
            note.ownerOf(_loanId),
            msg.sender,
            _terms.additionalPrincipal
        );

        emit LoanIncreased(_loanId);
    }

    /// @notice See {ISpiceLending-liquidate}
    function liquidate(uint256 _loanId) external nonReentrant {
        LibLoan.LoanData storage data = loans[_loanId];
        if (data.state != LibLoan.LoanState.Active) {
            revert InvalidState(data.state);
        }

        uint256 loanEndTime = data.startedAt + data.terms.duration;
        if (loanEndTime > block.timestamp) {
            revert LoanNotEnded();
        }

        // update loan state to Defaulted
        data.state = LibLoan.LoanState.Defaulted;

        // burn lender note
        note.burn(_loanId);

        IERC721Upgradeable(data.terms.baseTerms.collateralAddress)
            .safeTransferFrom(
                address(this),
                note.ownerOf(_loanId),
                data.terms.baseTerms.collateralId
            );

        emit LoanLiquidated(_loanId);
    }

    /******************/
    /* View Functions */
    /******************/

    /// @notice See {ISpiceLending-getLoanData}
    function getLoanData(uint256 _loanId)
        external
        view
        returns (LibLoan.LoanData memory)
    {
        return loans[_loanId];
    }

    /// @notice See {ISpiceLending-getNextLoanId}
    function getNextLoanId() external view returns (uint256) {
        return loanIdTracker.current();
    }

    /**********************/
    /* Internal Functions */
    /**********************/

    /// @dev Verify loan terms signature
    /// @param _terms Loan terms
    /// @param _signature Signature
    function _verifyLoanTermsSignature(
        LibLoan.LoanTerms calldata _terms,
        bytes calldata _signature
    ) internal view {
        // check if the loan terms is signed by signer
        bytes32 termsHash = LibLoan.getLoanTermsHash(_terms);
        _verifySignature(termsHash, _signature, _terms.baseTerms.lender);
    }

    /// @dev Verify extend loan terms signature
    /// @param _terms Extend loan terms
    /// @param _signature Signature
    function _verifyExtendLoanTermsSignature(
        LibLoan.ExtendLoanTerms calldata _terms,
        bytes calldata _signature
    ) internal view {
        // check if the loan terms is signed by signer
        bytes32 termsHash = LibLoan.getExtendLoanTermsHash(_terms);
        _verifySignature(termsHash, _signature, _terms.baseTerms.lender);
    }

    /// @dev Verify increase loan terms signature
    /// @param _terms Increase loan terms
    /// @param _signature Signature
    function _verifyIncreaseLoanTermsSignature(
        LibLoan.IncreaseLoanTerms calldata _terms,
        bytes calldata _signature
    ) internal view {
        // check if the loan terms is signed by signer
        bytes32 termsHash = LibLoan.getIncreaseLoanTermsHash(_terms);
        _verifySignature(termsHash, _signature, _terms.baseTerms.lender);
    }

    /// @dev Verify signature
    /// @param _termsHash Hash for terms
    /// @param _signature Signature
    /// @param _lender Lender address
    function _verifySignature(
        bytes32 _termsHash,
        bytes calldata _signature,
        address _lender
    ) internal view {
        bytes32 hash = _hashTypedDataV4(_termsHash);
        address recoveredSigner = ECDSA.recover(hash, _signature);
        if (recoveredSigner != signer) {
            revert InvalidSignature();
        }

        if (signer != _lender) {
            bytes4 magicValue = IERC1271(_lender).isValidSignature(
                hash,
                _signature
            );
            // bytes4(keccak256("isValidSignature(bytes32,bytes)"))
            if (magicValue != 0x1626ba7e) {
                revert InvalidSigner();
            }
        }
    }

    /// @dev Validate base loan terms
    /// @param _terms Current base terms
    /// @param _newTerms New base terms
    function _validateBaseTerms(
        LibLoan.BaseTerms storage _terms,
        LibLoan.BaseTerms calldata _newTerms
    ) internal view {
        // check loan terms expiration
        if (block.timestamp > _newTerms.expiration) {
            revert LoanTermsExpired();
        }

        // check if terms are valid
        if (_terms.collateralAddress != _newTerms.collateralAddress) {
            revert InvalidLoanTerms();
        }
        if (_terms.collateralId != _newTerms.collateralId) {
            revert InvalidLoanTerms();
        }
        if (_terms.lender != _newTerms.lender) {
            revert InvalidLoanTerms();
        }
        if (_terms.borrower != _newTerms.borrower) {
            revert InvalidLoanTerms();
        }
    }

    /// @dev Mints new note
    /// @param _loanId Loan ID
    /// @param _lender Lender address to receive note
    function _mintNote(uint256 _loanId, address _lender) internal {
        note.mint(_lender, _loanId);
    }

    /// @dev Transfer repayment from borrower.
    ///      If the collateral NFT is Spice NFT, then withdraw from the vault
    /// @param _collateralAddress Collateral NFT address
    /// @param _collateralId Collateral NFT Id
    /// @param _currency Currenty address
    /// @param _borrower Borrower address
    /// @param _payment Repayment amount
    function _transferRepayment(
        address _collateralAddress,
        uint256 _collateralId,
        address _currency,
        address _borrower,
        uint256 _payment
    ) internal {
        if (
            hasRole(SPICE_NFT_ROLE, _collateralAddress) &&
            ISpiceFiNFT4626(_collateralAddress).asset() == _currency
        ) {
            // withdraw assets from spice nft vault
            ISpiceFiNFT4626(_collateralAddress).withdraw(
                _collateralId,
                _payment,
                address(this)
            );
        } else {
            IERC20Upgradeable(_currency).safeTransferFrom(
                _borrower,
                address(this),
                _payment
            );
        }
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
        uint256 loanEndTime = _data.startedAt + _data.terms.duration;
        uint256 timeElapsed = (
            block.timestamp < loanEndTime ? block.timestamp : loanEndTime
        ) - _data.updatedAt;
        uint256 newInterest = (_data.balance *
            _data.terms.interestRate *
            timeElapsed) /
            DENOMINATOR /
            ONE_YEAR;

        return _data.interestAccrued + newInterest;
    }
}
