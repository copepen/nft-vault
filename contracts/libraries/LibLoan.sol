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

    struct BaseTerms {
        address collateralAddress;
        uint256 collateralId;
        uint256 expiration;
        address lender;
        address borrower;
    }

    /// @notice Loan Terms struct
    struct LoanTerms {
        BaseTerms baseTerms;
        uint256 principal;
        uint160 interestRate;
        uint32 duration;
        address currency;
    }

    /// @notice Extend Loan Terms struct
    struct ExtendLoanTerms {
        BaseTerms baseTerms;
        uint256 additionalPrincipal;
        uint160 newInterestRate;
        uint32 additionalDuration;
    }

    /// @notice Extend Loan Terms struct
    struct IncreaseLoanTerms {
        BaseTerms baseTerms;
        uint256 additionalPrincipal;
        uint160 newInterestRate;
    }

    /// @notice Loan Data struct
    struct LoanData {
        LoanState state;
        LoanTerms terms;
        uint256 startedAt;
        uint256 balance;
        uint256 interestAccrued;
        uint256 updatedAt;
    }

    /// @notice Get LoanTerms struct hash
    /// @param _terms Loan Terms
    /// @return hash struct hash
    function getLoanTermsHash(LoanTerms calldata _terms)
        internal
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encode(
                    keccak256(
                        "LoanTerms(BaseTerms baseTerms,uint256 principal,uint160 interestRate,uint32 duration,address currency)BaseTerms(address collateralAddress,uint256 collateralId,uint256 expiration,address lender,address borrower)"
                    ),
                    getBaseTermsHash(_terms.baseTerms),
                    _terms.principal,
                    _terms.interestRate,
                    _terms.duration,
                    _terms.currency
                )
            );
    }

    /// @notice Get ExtendLoanTerms struct hash
    /// @param _terms Extend Loan Terms
    /// @return hash struct hash
    function getExtendLoanTermsHash(ExtendLoanTerms calldata _terms)
        internal
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encode(
                    keccak256(
                        "ExtendLoanTerms(BaseTerms baseTerms,uint256 additionalPrincipal,uint160 newInterestRate,uint32 additionalDuration)BaseTerms(address collateralAddress,uint256 collateralId,uint256 expiration,address lender,address borrower)"
                    ),
                    getBaseTermsHash(_terms.baseTerms),
                    _terms.additionalPrincipal,
                    _terms.newInterestRate,
                    _terms.additionalDuration
                )
            );
    }

    /// @notice Get IncreaseLoanTerms struct hash
    /// @param _terms Increase Loan Terms
    /// @return hash struct hash
    function getIncreaseLoanTermsHash(IncreaseLoanTerms calldata _terms)
        internal
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encode(
                    keccak256(
                        "IncreaseLoanTerms(BaseTerms baseTerms,uint256 additionalPrincipal,uint160 newInterestRate)BaseTerms(address collateralAddress,uint256 collateralId,uint256 expiration,address lender,address borrower)"
                    ),
                    getBaseTermsHash(_terms.baseTerms),
                    _terms.additionalPrincipal,
                    _terms.newInterestRate
                )
            );
    }

    /// @notice Get BaseTerms struct hash
    /// @param _terms Base Terms
    /// @return hash struct hash
    function getBaseTermsHash(BaseTerms calldata _terms)
        internal
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encode(
                    keccak256(
                        "BaseTerms(address collateralAddress,uint256 collateralId,uint256 expiration,address lender,address borrower)"
                    ),
                    _terms.collateralAddress,
                    _terms.collateralId,
                    _terms.expiration,
                    _terms.lender,
                    _terms.borrower
                )
            );
    }
}
