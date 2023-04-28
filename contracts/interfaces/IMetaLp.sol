// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

interface IMetaLp {
    /**
     * @notice Get amount of redemption available for withdraw for account
     * @param account Account
     * @param processedRedemptionQueue Current value of vault's processed
     * redemption queue
     * @return Amount available for withdraw
     */
    function redemptionAvailable(address account, uint256 processedRedemptionQueue) external view returns (uint256);
}
