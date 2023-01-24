// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../libraries/LibLoan.sol";

/**
 * @title ISpiceLending
 * @author Spice Finance Inc
 */
interface ISpiceLending {
    /**********/
    /* Events */
    /**********/

    /// @notice Emitted when interest fee rate is updated
    /// @param interestFee New interest fee rate
    event InterestFeeUpdated(uint256 interestFee);

    /// @notice Emitted when liquidation ratio is updated
    /// @param liquidationRatio New liquidation ratio
    event LiquidationRatioUpdated(uint256 liquidationRatio);

    /// @notice Emitted when loan ratio is updated
    /// @param loanRatio New loan ratio
    event LoanRatioUpdated(uint256 loanRatio);

    /// @notice Emitted when a new loan is started
    /// @param loanId Loan Id
    /// @param borrower Borrower address
    event LoanStarted(uint256 loanId, address borrower);

    /// @notice Emitted when note contracts are set
    /// @param lenderNote Lender Note address
    /// @param borrowerNote Borrower Note address
    event NotesUpdated(address lenderNote, address borrowerNote);

    /// @notice Emitted when the loan is updated
    /// @param loanId Loan Id
    event LoanUpdated(uint256 loanId);

    /// @notice Emitted when the loan is repaid
    /// @param loanId Loan Id
    event LoanRepaid(uint256 loanId);

    /// @notice Emitted when the loan is liquidated
    /// @param loanId Loan Id
    event LoanLiquidated(uint256 loanId);

    /******************/
    /* User Functions */
    /******************/

    /// @notice Initiate a new loan
    /// @dev Emits {LoanStarted} event
    /// @param _terms Loan Terms
    /// @param _signature Signature
    ///
    /// @return loanId Loan Id
    function initiateLoan(
        LibLoan.LoanTerms calldata _terms,
        bytes calldata _signature
    ) external returns (uint256 loanId);

    /// @notice Update loan terms
    /// @dev Emits {LoanUpdated} event
    /// @param _loanId The loan ID
    /// @param _terms New Loan Terms
    /// @param _signature Signature
    function updateLoan(
        uint256 _loanId,
        LibLoan.LoanTerms calldata _terms,
        bytes calldata _signature
    ) external;

    /// @notice Deposit into vault NFT represents
    /// @param _loanId Loan ID
    /// @param _amount Amount to deopsit
    ///
    /// @return shares additional shares of vault
    function makeDeposit(
        uint256 _loanId, 
        uint256 _amount
    ) external returns (uint256 shares);

    /// @notice Partialy repay the loan
    /// @dev Emits {LoanRepaid} event
    /// @param _loanId The loan ID
    /// @param _payment Repayment amount
    function partialRepay(uint256 _loanId, uint256 _payment) external;

    /// @notice Repay the loan
    /// @dev Emits {LoanRepaid} event
    /// @param _loanId The loan ID
    function repay(uint256 _loanId) external;

    /// @notice Liquidate loan that is past its duration
    /// @dev Emits {LoanLiquidated} event
    /// @param _loanId The loan ID
    function liquidate(uint256 _loanId) external;

    /// @notice Return loan data for given loan id
    /// @param _loanId The loan ID
    /// @return data Loan data
    function getLoanData(uint256 _loanId)
        external
        view
        returns (LibLoan.LoanData memory);

    /// @notice Return next loan ID
    /// @return id The next loan ID
    function getNextLoanId() external view returns (uint256);

    /// @notice Return amount needed to completely repay loan
    /// @param _loanId The loan ID
    /// @return amount The max repay amount
    function repayAmount(uint256 _loanId) external view returns (uint256);
}
