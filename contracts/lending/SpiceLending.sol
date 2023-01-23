// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
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

interface ISpiceFiNFT4626 {
    function asset() external view returns (address);

    function tokenShares(uint256 tokenId) external view returns (uint256);

    function previewRedeem(uint256 shares)
        external
        view
        returns (uint256 assets);

    function deposit(
        uint256 tokenId,
        uint256 assets
    ) external returns (uint256 shares);

    function withdraw(
        uint256 tokenId,
        uint256 assets,
        address receiver
    ) external returns (uint256 shares);
}

/**
 * @title Storage for SpiceLending
 * @author Spice Finance Inc
 */
abstract contract SpiceLendingStorage {
    /// @notice loan id tracker
    CountersUpgradeable.Counter internal loanIdTracker;

    /// @notice keep track of loans
    mapping(uint256 => LibLoan.LoanData) public loans;

    /// @notice Lender Note
    INote public lenderNote;

    /// @notice Borrwoer Note
    INote public borrowerNote;

    /// @notice Interest fee rate
    uint256 public interestFee;

    /// @notice Liquidation ratio
    uint256 public liquidationRatio;

    /// @notice Loan ratio
    uint256 public loanRatio;

    /// @notice Signature used
    mapping(bytes32 => bool) public signatureUsed;
}

/**
 * @title SpiceLending
 * @author Spice Finance Inc
 */
contract SpiceLending is
    ISpiceLending,
    SpiceLendingStorage,
    Initializable,
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

    /// @notice Signer role
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");

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
    error NotLiquidatible();

    /// @notice Signature Used
    error SignatureUsed(bytes signature);

    /// @notice loanAmount Exceeds Max LTV
    error LoanAmountExceeded();

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
    /// @param _interestFee Interest fee rate
    /// @param _liquidationRatio Liquidation ratio
    /// @param _loanRatio Loan ratio
    function initialize(
        address _signer,
        uint256 _interestFee,
        uint256 _liquidationRatio,
        uint256 _loanRatio
    ) external initializer {
        if (_signer == address(0)) {
            revert InvalidAddress();
        }
        if (_interestFee > DENOMINATOR) {
            revert ParameterOutOfBounds();
        }
        if (_liquidationRatio > DENOMINATOR) {
            revert ParameterOutOfBounds();
        }
        if (_loanRatio > DENOMINATOR) {
            revert ParameterOutOfBounds();
        }

        __EIP712_init("SpiceLending", "1");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SIGNER_ROLE, _signer);

        interestFee = _interestFee;
        liquidationRatio = _liquidationRatio;
        loanRatio = _loanRatio;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /***********/
    /* Setters */
    /***********/

    /// @notice Set note contracts
    ///
    /// Emits a {NotesUpdated} event.
    ///
    /// @param _lenderNote lender Note
    /// @param _borrowerNote borrower Note
    function setNotes(INote _lenderNote, INote _borrowerNote)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (address(_lenderNote) == address(0)) {
            revert InvalidAddress();
        }
        if (address(_borrowerNote) == address(0)) {
            revert InvalidAddress();
        }

        lenderNote = _lenderNote;
        borrowerNote = _borrowerNote;

        emit NotesUpdated(address(lenderNote), address(borrowerNote));
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

    /// @notice Set the liquidation ratio
    ///
    /// Emits a {LiquidationRatioUpdated} event.
    ///
    /// @param _liquidationRatio Liquidation ratio
    function setLiquidationRatio(uint256 _liquidationRatio)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (_liquidationRatio > DENOMINATOR) {
            revert ParameterOutOfBounds();
        }
        liquidationRatio = _liquidationRatio;

        emit LiquidationRatioUpdated(_liquidationRatio);
    }

    /// @notice Set the loan ratio
    ///
    /// Emits a {LoanRatioUpdated} event.
    ///
    /// @param _loanRatio Loan ratio
    function setLoanRatio(uint256 _loanRatio)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (_loanRatio > DENOMINATOR) {
            revert ParameterOutOfBounds();
        }
        loanRatio = _loanRatio;

        emit LoanRatioUpdated(_loanRatio);
    }

    /******************/
    /* User Functions */
    /******************/

    /// @notice See {ISpiceLending-initiateLoan}
    function initiateLoan(
        LibLoan.FullLoanTerms calldata _terms,
        bytes calldata _signature
    ) external nonReentrant returns (uint256 loanId) {
        // check loan terms expiration
        if (block.timestamp > _terms.expiration) {
            revert LoanTermsExpired();
        }

        // check loan amount
        uint256 collateral = _getCollateralAmount(
            _terms.collateralAddress,
            _terms.collateralId
        );
        if (collateral < (_terms.loanAmount * loanRatio) / DENOMINATOR) {
            revert LoanAmountExceeded();
        }

        // verify loan terms signature
        _verifyFullLoanTermsSignature(_terms, _signature);

        // get current loanId and increment for next function call
        loanId = loanIdTracker.current();
        loanIdTracker.increment();

        // initiate new loan
        loans[loanId] = LibLoan.LoanData({
            state: LibLoan.LoanState.Active,
            terms: _terms,
            startedAt: block.timestamp,
            balance: _terms.loanAmount,
            interestAccrued: 0,
            updatedAt: block.timestamp
        });

        // mint notes
        _mintNote(loanId, _terms.lender, _terms.borrower);
        
        // transfer NFT collateral
        IERC721Upgradeable(_terms.collateralAddress).safeTransferFrom(
                msg.sender,
                address(this),
                _terms.collateralId
            );

        // deposit borrowed funds on behalf of borrower
        IERC20Upgradeable(_terms.currency).safeTransferFrom(
            _terms.lender,
            address(this),
            _terms.loanAmount
        );

        ISpiceFiNFT4626(_terms.collateralAddress).deposit(_terms.collateralId, _terms.loanAmount);

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

        address lender = lenderNote.ownerOf(_loanId);
        address borrower = data.terms.borrower;

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
        if (_payment > interestToPay) {
            interestPayment = interestToPay;
            data.balance -= _payment - interestToPay;
            data.interestAccrued = 0;
        } else {
            interestPayment = _payment;
            data.interestAccrued = interestToPay - _payment;
        }

        // update loan data
        data.updatedAt = block.timestamp;

        IERC20Upgradeable currency = IERC20Upgradeable(data.terms.currency);

        _transferRepayment(
            data.terms.collateralAddress,
            data.terms.collateralId,
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

            // burn notes
            lenderNote.burn(_loanId);
            borrowerNote.burn(_loanId);

            // return collateral NFT to borrower
            IERC721Upgradeable(data.terms.collateralAddress)
                .safeTransferFrom(
                    address(this),
                    borrower,
                    data.terms.collateralId
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

        address lender = lenderNote.ownerOf(_loanId);
        address borrower = data.terms.borrower;

        if (msg.sender != borrower) {
            revert InvalidMsgSender();
        }

        // calc total interest to pay
        uint256 interestToPay = _calcInterest(data);
        uint256 payment = data.balance + interestToPay;

        // update loan data
        data.balance = 0;
        data.interestAccrued = 0;
        data.updatedAt = block.timestamp;

        IERC20Upgradeable currency = IERC20Upgradeable(data.terms.currency);

        _transferRepayment(
            data.terms.collateralAddress,
            data.terms.collateralId,
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

        // burn notes
        lenderNote.burn(_loanId);
        borrowerNote.burn(_loanId);

        // return collateral NFT to borrower
        IERC721Upgradeable(data.terms.collateralAddress)
            .safeTransferFrom(
                address(this),
                borrower,
                data.terms.collateralId
            );

        emit LoanRepaid(_loanId);
    }

    /// @notice See {ISpiceLending-updateLoan}
    function updateLoan(
        uint256 _loanId,
        LibLoan.FullLoanTerms calldata _terms,
        bytes calldata _signature
    ) external nonReentrant updateInterest(_loanId) {
        LibLoan.LoanData storage data = loans[_loanId];
        if (data.state != LibLoan.LoanState.Active) {
            revert InvalidState(data.state);
        }
        address lender = lenderNote.ownerOf(_loanId);
        if (msg.sender != data.terms.borrower || msg.sender != lender) {
            revert InvalidMsgSender();
        }
        if (_terms.lender != lender) {
            revert InvalidMsgSender();
        }
        // check loan amount
        uint256 collateral = _getCollateralAmount(
            _terms.collateralAddress,
            _terms.collateralId
        );
        if (collateral < (_terms.loanAmount * loanRatio) / DENOMINATOR) {
            revert LoanAmountExceeded();
        }
        _validateFullLoanTerms(data.terms, _terms);

        // TODO: everything below needs editing
    
        // verify loan terms signature
        _verifyFullLoanTermsSignature(_terms, _signature);

        // update new loan
        loans[_loanId] = LibLoan.LoanData({
            state: LibLoan.LoanState.Active,
            terms: _terms,
            startedAt: block.timestamp,
            balance: _terms.loanAmount,
            interestAccrued: 0,
            updatedAt: block.timestamp
        });

        // data.terms.loanAmount += _terms.additionalloanAmount;
        // data.balance += _terms.additionalloanAmount;
        // data.terms.interestRate = _terms.newInterestRate;
        // data.terms.duration += _terms.additionalDuration;

        // IERC20Upgradeable(data.terms.currency).safeTransferFrom(
            // lender,
            // msg.sender,
            // _terms.additionalloanAmount
        // );

        emit LoanUpdated(_loanId);
    }

    /// @notice See {ISpiceLending-liquidate}
    function liquidate(uint256 _loanId) external nonReentrant {
        LibLoan.LoanData storage data = loans[_loanId];
        if (data.state != LibLoan.LoanState.Active) {
            revert InvalidState(data.state);
        }

        uint32 duration = data.terms.duration;
        if (duration != type(uint32).max) {
            uint256 loanEndTime = data.startedAt + duration;
            if (loanEndTime > block.timestamp) {
                revert NotLiquidatible();
            }
        } else {
            uint256 collateral = _getCollateralAmount(
                data.terms.collateralAddress,
                data.terms.collateralId
            );
            if (data.balance <= (collateral * liquidationRatio) / DENOMINATOR) {
                revert NotLiquidatible();
            }
        }

        // update loan state to Defaulted
        data.state = LibLoan.LoanState.Defaulted;

        address lender = lenderNote.ownerOf(_loanId);

        // burn notes
        lenderNote.burn(_loanId);
        borrowerNote.burn(_loanId);

        IERC721Upgradeable(data.terms.collateralAddress)
            .safeTransferFrom(
                address(this),
                lender,
                data.terms.collateralId
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

    /// @dev Check if the signature is used
    /// @param _signature Signature
    function _checkSignatureUsage(bytes calldata _signature) internal {
        bytes32 sigHash = keccak256(_signature);
        if (signatureUsed[sigHash]) {
            revert SignatureUsed(_signature);
        }
        signatureUsed[sigHash] = true;
    }

    /// @dev Verify loan terms signature
    /// @param _terms Loan terms
    /// @param _signature Signature
    function _verifyFullLoanTermsSignature(
        LibLoan.FullLoanTerms calldata _terms,
        bytes calldata _signature
    ) internal view {
        // check if the loan terms is signed by signer
        bytes32 termsHash = LibLoan.getFullLoanTermsHash(_terms);
        _verifySignature(termsHash, _signature, _terms.lender);
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
	require(
            getRoleMemberCount(SIGNER_ROLE) == 0 || hasRole(SIGNER_ROLE, recoveredSigner),
            "signer is not enabled"
        );

        if (recoveredSigner != _lender) {
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

    /// @dev Validate full loan terms
    /// @param _terms Current loan terms
    /// @param _newTerms New loan terms
    function _validateFullLoanTerms(
        LibLoan.FullLoanTerms storage _terms,
        LibLoan.FullLoanTerms calldata _newTerms
    ) internal view {
        // check loan terms expiration
        if (block.timestamp > _newTerms.expiration) {
            revert LoanTermsExpired();
        }
        if (_terms.collateralAddress != _newTerms.collateralAddress){
            revert InvalidLoanTerms();
        }
        if (_terms.collateralId != _newTerms.collateralId){
            revert InvalidLoanTerms();
        }
        if (_terms.loanAmount <= _newTerms.loanAmount){
            revert InvalidLoanTerms();
        }
        if (_terms.borrower != _newTerms.borrower){
            revert InvalidLoanTerms();
        }
        if (_terms.currency != _newTerms.currency){
            revert InvalidLoanTerms();
        }
        if (_terms.priceLiquidation != _newTerms.priceLiquidation){
            revert InvalidLoanTerms();
        }
    }

    /// @dev Mints new notes
    /// @param _loanId Loan ID
    /// @param _lender Lender address to receive lender note
    /// @param _borrower Lender address to receive lender note
    function _mintNote(uint256 _loanId, address _lender, address _borrower) internal {
        lenderNote.mint(_lender, _loanId);
        borrowerNote.mint(_borrower, _loanId);
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

    /// @dev Get collateral amount for Spice NFT
    /// @param _collateralAddress Collateral NFT address
    /// @param _collateralId Collateral NFT Id
    /// @return assets Collateral amount
    function _getCollateralAmount(
        address _collateralAddress,
        uint256 _collateralId
    ) internal view returns (uint256 assets) {
        uint256 shares = ISpiceFiNFT4626(_collateralAddress).tokenShares(
            _collateralId
        );
        assets = ISpiceFiNFT4626(_collateralAddress).previewRedeem(shares);
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
