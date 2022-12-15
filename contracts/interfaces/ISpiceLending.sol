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
    event LoanStarted(uint256 indexed loanId, address borrower);

    /// @notice Emitted when the loan is repaid
    /// @param loanId Loan Id
    event LoanRepaid(uint256 loanId);

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
}
