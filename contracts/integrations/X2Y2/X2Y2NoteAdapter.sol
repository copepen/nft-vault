// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../../interfaces/INoteAdapter.sol";

/*******************************/
/* X2Y2 Interfaces (subset) */
/*******************************/

interface IAddressProvider {
    function getXY3() external view returns (address);

    function getLenderNote() external view returns (address);

    function getBorrowerNote() external view returns (address);
}

interface IXY3 {
    enum StatusType {
        NOT_EXISTS,
        NEW,
        RESOLVED
    }

    struct LoanState {
        uint64 xy3NftId;
        StatusType status;
    }

    function loanDetails(
        uint32
    )
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            address,
            uint32,
            uint16,
            uint64,
            address,
            bool
        );

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

    IAddressProvider private immutable _addressProvider;
    IXY3 private immutable _xy3;
    IXy3Nft private immutable _lenderNote;
    IERC721 private immutable _borrowerNote;

    /***************/
    /* Constructor */
    /***************/

    /// @notice X2Y2NoteAdapter constructor
    /// @param addressProvider X2Y2 Address Provider
    constructor(IAddressProvider addressProvider) {
        _addressProvider = addressProvider;
        _xy3 = IXY3(_addressProvider.getXY3());
        _lenderNote = IXy3Nft(_addressProvider.getLenderNote());
        _borrowerNote = IERC721(_addressProvider.getBorrowerNote());
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
        return IERC721(address(_lenderNote));
    }

    /// @inheritdoc INoteAdapter
    function isSupported(
        uint256 noteTokenId,
        address currencyToken
    ) external view returns (bool) {
        // Lookup loan id and loan minter
        IXy3Nft.Ticket memory ticket = _lenderNote.tickets(noteTokenId);

        // Validate loan minter
        if (ticket.minter != address(_xy3)) return false;

        // Lookup loan detail
        (, , , address borrowAsset, , , , , ) = _xy3.loanDetails(
            uint32(ticket.loanId)
        );

        // Validate loan currency token matches
        if (borrowAsset != currencyToken) return false;

        return true;
    }

    /// @inheritdoc INoteAdapter
    function getLoanInfo(
        uint256 noteTokenId
    ) external view returns (LoanInfo memory) {
        // Lookup loan id
        IXy3Nft.Ticket memory ticket = _lenderNote.tickets(noteTokenId);

        // Lookup loan detail
        (
            uint256 borrowAmount,
            uint256 repayAmount,
            uint256 nftTokenId,
            address borrowAsset,
            uint32 loanDuration,
            uint16 adminShare,
            uint64 loanStart,
            address nftAsset,

        ) = _xy3.loanDetails(uint32(ticket.loanId));

        // Calculate admin fee
        {
            uint256 adminFee = ((repayAmount - borrowAmount) *
                uint256(adminShare)) / 10000;
            repayAmount -= adminFee;
        }

        // Arrange into LoanInfo structure
        LoanInfo memory loanInfo = LoanInfo({
            loanId: ticket.loanId,
            borrower: _borrowerNote.ownerOf(noteTokenId),
            principal: borrowAmount,
            repayment: repayAmount,
            maturity: loanStart + loanDuration,
            duration: loanDuration,
            currencyToken: borrowAsset,
            collateralToken: nftAsset,
            collateralTokenId: nftTokenId
        });

        return loanInfo;
    }

    /// @inheritdoc INoteAdapter
    function getLoanAssets(
        uint256 noteTokenId
    ) external view returns (AssetInfo[] memory) {
        // Lookup loan id
        IXy3Nft.Ticket memory ticket = _lenderNote.tickets(noteTokenId);

        // Lookup loan detail
        (, , uint256 nftTokenId, , , , , address nftAsset, ) = _xy3.loanDetails(
            uint32(ticket.loanId)
        );

        // Collect collateral assets
        AssetInfo[] memory collateralAssets = new AssetInfo[](1);
        collateralAssets[0].token = nftAsset;
        collateralAssets[0].tokenId = nftTokenId;

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
        return
            loanState.status == IXY3.StatusType.NOT_EXISTS ||
            loanState.status == IXY3.StatusType.RESOLVED;
    }

    /// @inheritdoc INoteAdapter
    function isLiquidated(uint256 loanId) external view returns (bool) {
        // Lookup loan state
        IXY3.LoanState memory loanState = _xy3.getLoanState(uint32(loanId));

        // No way to differentiate a repaid loan from a liquidated loan from just loanId
        return
            loanState.status == IXY3.StatusType.NOT_EXISTS ||
            loanState.status == IXY3.StatusType.RESOLVED;
    }

    /// @inheritdoc INoteAdapter
    function isExpired(uint256 loanId) external view returns (bool) {
        // Lookup loan state
        IXY3.LoanState memory loanState = _xy3.getLoanState(uint32(loanId));

        // Lookup loan detail
        (, , , , uint32 loanDuration, , uint64 loanStart, , ) = _xy3
            .loanDetails(uint32(loanId));

        return
            loanState.status == IXY3.StatusType.NEW &&
            block.timestamp > loanStart + loanDuration;
    }
}
