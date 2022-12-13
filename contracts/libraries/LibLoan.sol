// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;


/**
 * @title LibLoan
 * @author Spice Finance Inc
 */
library LibLoan {
    /// @notice Loan State
    enum LoanState {
        NOT_IN_USE,
        Active,
        Repaid,
        Defaulted
    }

    /// @notice Loan Terms struct
    struct LoanTerms {
        address collateralAddress;
        uint256 collateralId;
        uint256 principal;
        uint160 interestRate;
        uint32 duration;
        uint32 deadline;
        address lender;
        address borrower;
        address currency;
    }

    /// @notice Loan Data struct
    struct LoanData {
        LoanState state;
        LoanTerms terms;
        uint256 startedAt;
        uint256 balance;
        uint256 balancePaid;
        uint256 feesAccrued;
    }
}
