// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../../interfaces/INoteAdapter.sol";
import "../../interfaces/INote.sol";
import "../../libraries/LibLoan.sol";

/*****************************/
/* Spice Interfaces (subset) */
/*****************************/

interface ISpiceLending {
    function lenderNote() external view returns (INote noteToken);

    function getLoanData(
        uint256
    ) external view returns (LibLoan.LoanData memory);
}

/*******************************/
/* Note Adapter Implementation */
/*******************************/

/**
 * @title Spice Note Adapter
 */
contract SpiceNoteAdapter is INoteAdapter {
    /*************/
    /* Constants */
    /*************/

    /// @notice Implementation version
    string public constant IMPLEMENTATION_VERSION = "1.0";

    /**************/
    /* Properties */
    /**************/

    ISpiceLending private immutable _lending;
    INote private immutable _noteToken;

    /***************/
    /* Constructor */
    /***************/

    /// @notice SpiceNoteAdapter constructor
    /// @param lending Spice lending contract
    constructor(ISpiceLending lending) {
        _lending = lending;
        _noteToken = _lending.lenderNote();
    }

    /******************/
    /* Implementation */
    /******************/

    /// @inheritdoc INoteAdapter
    function name() external pure returns (string memory) {
        return "Spice Note Adapter";
    }

    /// @inheritdoc INoteAdapter
    function noteToken() external view returns (IERC721) {
        return IERC721(address(_noteToken));
    }

    /// @inheritdoc INoteAdapter
    function isSupported(
        uint256 noteTokenId,
        address currencyToken
    ) external view returns (bool) {
        // Lookup loan data
        LibLoan.LoanData memory data = _lending.getLoanData(noteTokenId);

        // Validate loan currency token matches
        if (data.terms.currency != currencyToken) return false;

        return true;
    }

    /// @inheritdoc INoteAdapter
    function getLoanInfo(
        uint256 noteTokenId
    ) external view returns (LoanInfo memory) {
        // Lookup loan data
        LibLoan.LoanData memory data = _lending.getLoanData(noteTokenId);

        uint256 fullInterest = (data.terms.loanAmount *
            data.terms.interestRate *
            data.terms.duration) /
            10000 /
            365 days;

        // Arrange into LoanInfo structure
        LoanInfo memory loanInfo = LoanInfo({
            loanId: noteTokenId,
            borrower: data.terms.borrower,
            principal: data.terms.loanAmount,
            repayment: data.terms.loanAmount + fullInterest,
            maturity: uint64(data.startedAt) + data.terms.duration,
            duration: data.terms.duration,
            currencyToken: data.terms.currency,
            collateralToken: data.terms.collateralAddress,
            collateralTokenId: data.terms.collateralId
        });

        return loanInfo;
    }

    /// @inheritdoc INoteAdapter
    function getLoanAssets(
        uint256 noteTokenId
    ) external view returns (AssetInfo[] memory) {
        // Lookup loan data
        LibLoan.LoanData memory data = _lending.getLoanData(noteTokenId);

        // Collect collateral assets
        AssetInfo[] memory collateralAssets = new AssetInfo[](1);
        collateralAssets[0].token = data.terms.collateralAddress;
        collateralAssets[0].tokenId = data.terms.collateralId;

        return collateralAssets;
    }

    /// @inheritdoc INoteAdapter
    function getLiquidateCalldata(
        uint256 loanId
    ) external view returns (address, bytes memory) {
        return (
            address(_lending),
            abi.encodeWithSignature("liquidate(uint256)", loanId)
        );
    }

    /// @inheritdoc INoteAdapter
    function getUnwrapCalldata(
        uint256
    ) external pure returns (address, bytes memory) {
        return (address(0), "");
    }

    /// @inheritdoc INoteAdapter
    function isRepaid(uint256 loanId) external view returns (bool) {
        // Lookup loan data
        LibLoan.LoanData memory data = _lending.getLoanData(loanId);

        return data.state == LibLoan.LoanState.Repaid;
    }

    /// @inheritdoc INoteAdapter
    function isLiquidated(uint256 loanId) external view returns (bool) {
        // Lookup loan data
        LibLoan.LoanData memory data = _lending.getLoanData(loanId);

        return data.state == LibLoan.LoanState.Defaulted;
    }

    /// @inheritdoc INoteAdapter
    function isExpired(uint256 loanId) external view returns (bool) {
        // Lookup loan data
        LibLoan.LoanData memory data = _lending.getLoanData(loanId);

        return
            data.state == LibLoan.LoanState.Active &&
            block.timestamp > data.startedAt + data.terms.duration;
    }
}
