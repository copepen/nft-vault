// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../../interfaces/INoteAdapter.sol";

/*******************************/
/* X2Y2 Interfaces (subset) */
/*******************************/

interface IXY3 {
    struct LoanDetail {
        uint256 borrowAmount;
        uint256 repayAmount;
        uint256 nftTokenId;
        address borrowAsset;
        uint32 loanDuration;
        uint16 adminShare;
        uint64 loanStart;
        address nftAsset;
        address borrower;
        bool isCollection;
    }

    enum StatusType {
        NOT_EXISTS,
        NEW,
        RESOLVED
    }

    struct LoanState {
        uint64 xy3NftId;
        StatusType status;
    }

    function ticketToken() external view returns (address);

    function loanDetails(
        uint32 _loanId
    ) external view returns (LoanDetail memory);

    function getLoanState(
        uint32 _loanId
    ) external view returns (LoanState memory);
}

interface IXy3Nft {
    struct Ticket {
        uint256 loanId;
        address minter;
    }

    function tickets(uint256 _ticketId) external view returns (Ticket memory);
}

/*******************************/
/* Note Adapter Implementation */
/*******************************/

/**
 * @title X2Y2 Note Adapter
 */
contract X2Y2NoteAdapter is INoteAdapter {
    /*************/
    /* Constants */
    /*************/

    /// @notice Implementation version
    string public constant IMPLEMENTATION_VERSION = "1.0";

    /**************/
    /* Properties */
    /**************/

    IXY3 private immutable _xy3;
    IXy3Nft private immutable _noteToken;

    /***************/
    /* Constructor */
    /***************/

    /// @notice X2Y2NoteAdapter constructor
    /// @param xy3 XY3 contract
    constructor(IXY3 xy3) {
        _xy3 = xy3;
        _noteToken = IXy3Nft(_xy3.ticketToken());
    }

    /******************/
    /* Implementation */
    /******************/

    /// @inheritdoc INoteAdapter
    function name() external pure returns (string memory) {
        return "X2Y2 Note Adapter";
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
        // Lookup loan id and loan minter
        IXy3Nft.Ticket memory ticket = _noteToken.tickets(noteTokenId);

        // Validate loan minter
        if (ticket.minter != address(_xy3)) return false;

        // Lookup loan detail
        IXY3.LoanDetail memory loanDetail = _xy3.loanDetails(
            uint32(ticket.loanId)
        );

        // Validate loan currency token matches
        if (loanDetail.borrowAsset != currencyToken) return false;

        return true;
    }

    /// @inheritdoc INoteAdapter
    function getLoanInfo(
        uint256 noteTokenId
    ) external view returns (LoanInfo memory) {
        // Lookup loan id
        IXy3Nft.Ticket memory ticket = _noteToken.tickets(noteTokenId);

        // Lookup loan detail
        IXY3.LoanDetail memory loanDetail = _xy3.loanDetails(
            uint32(ticket.loanId)
        );

        // Calculate admin fee
        uint256 adminFee = ((loanDetail.repayAmount - loanDetail.borrowAmount) *
            uint256(loanDetail.adminShare)) / 10000;

        // Arrange into LoanInfo structure
        LoanInfo memory loanInfo = LoanInfo({
            loanId: ticket.loanId,
            borrower: loanDetail.borrower,
            principal: loanDetail.borrowAmount,
            repayment: loanDetail.repayAmount - adminFee,
            maturity: loanDetail.loanStart + loanDetail.loanDuration,
            duration: loanDetail.loanDuration,
            currencyToken: loanDetail.borrowAsset,
            collateralToken: loanDetail.nftAsset,
            collateralTokenId: loanDetail.nftTokenId
        });

        return loanInfo;
    }

    /// @inheritdoc INoteAdapter
    function getLoanAssets(
        uint256 noteTokenId
    ) external view returns (AssetInfo[] memory) {
        // Lookup loan id
        IXy3Nft.Ticket memory ticket = _noteToken.tickets(noteTokenId);

        // Lookup loan detail
        IXY3.LoanDetail memory loanDetail = _xy3.loanDetails(
            uint32(ticket.loanId)
        );

        // Collect collateral assets
        AssetInfo[] memory collateralAssets = new AssetInfo[](1);
        collateralAssets[0].token = loanDetail.nftAsset;
        collateralAssets[0].tokenId = loanDetail.nftTokenId;

        return collateralAssets;
    }

    /// @inheritdoc INoteAdapter
    function getLiquidateCalldata(
        uint256 loanId
    ) external view returns (address, bytes memory) {
        return (
            address(_xy3),
            abi.encodeWithSignature("liquidate(uint32)", uint32(loanId))
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
        // Lookup loan state
        IXY3.LoanState memory loanState = _xy3.getLoanState(uint32(loanId));

        // No way to differentiate a repaid loan from a liquidated loan from just loanId
        return loanState.status == IXY3.StatusType.RESOLVED;
    }

    /// @inheritdoc INoteAdapter
    function isLiquidated(uint256 loanId) external view returns (bool) {
        // Lookup loan state
        IXY3.LoanState memory loanState = _xy3.getLoanState(uint32(loanId));

        // No way to differentiate a repaid loan from a liquidated loan from just loanId
        return loanState.status == IXY3.StatusType.RESOLVED;
    }

    /// @inheritdoc INoteAdapter
    function isExpired(uint256 loanId) external view returns (bool) {
        // Lookup loan state
        IXY3.LoanState memory loanState = _xy3.getLoanState(uint32(loanId));

        // Lookup loan detail
        IXY3.LoanDetail memory loanDetail = _xy3.loanDetails(uint32(loanId));

        return
            loanState.status == IXY3.StatusType.NEW &&
            block.timestamp > loanDetail.loanStart + loanDetail.loanDuration;
    }
}
