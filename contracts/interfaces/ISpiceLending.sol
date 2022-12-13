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

    /// @notice Emitted when a new loan is started
    /// @param loanId Loan Id
    /// @param borrower Borrower address
    event LoanStarted(uint256 indexed loanId, address borrower);

    /******************/
    /* User Functions */
    /******************/

    /// @notice Initiate a new loan
    ///
    /// Emits {LoanStarted} event
    ///
    /// @param _terms Loan Terms
    /// @param _signature Signature
    ///
    /// @return loanId Loan Id
    function initiateLoan(
        LibLoan.LoanTerms calldata _terms,
        bytes calldata _signature
    ) external returns (uint256 loanId);
}
