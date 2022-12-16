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

    /// @notice Emitted when a new loan is started
    /// @param loanId Loan Id
    /// @param borrower Borrower address
    event LoanStarted(uint256 loanId, address borrower);

    /// @notice Emitted when the loan is extended
    /// @param loanId Loan Id
    event LoanExtended(uint256 loanId);

    /// @notice Emitted when the loan is increased
    /// @param loanId Loan Id
    event LoanIncreased(uint256 loanId);

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

    /// @notice Partialy repay the loan
    /// @dev Emits {LoanRepaid} event
    /// @param _loanId The loan ID
    /// @param _payment Repayment amount
    function partialRepay(uint256 _loanId, uint256 _payment) external;

    /// @notice Repay the loan
    /// @dev Emits {LoanRepaid} event
    /// @param _loanId The loan ID
    function repay(uint256 _loanId) external;

    /// @notice Extend loan principal and duration
    /// @dev Emits {LoanExtended} event
    /// @param _loanId The loan ID
    /// @param _terms Extend Loan Terms
    /// @param _signature Signature
    function extendLoan(
        uint256 _loanId,
        LibLoan.ExtendLoanTerms calldata _terms,
        bytes calldata _signature
    ) external;

    /// @notice Increase loan principal
    /// @dev Emits {LoanIncreased} event
    /// @param _loanId The loan ID
    /// @param _terms Increase Loan Terms
    /// @param _signature Signature
    function increaseLoan(
        uint256 _loanId,
        LibLoan.IncreaseLoanTerms calldata _terms,
        bytes calldata _signature
    ) external;

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
}
