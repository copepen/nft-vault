// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

interface IMetaLp {
    /**
     * @notice Redemption state for account
     * @param pending Pending redemption amount
     * @param withdrawn Withdrawn redemption amount
     * @param redemptionQueueTarget Target in vault's redemption queue
     */
    struct Redemption {
        uint256 pending;
        uint256 withdrawn;
        uint256 redemptionQueueTarget;
    }

    /**
     * @notice Get redemption state for account
     * @param account Account
     * @return Redemption state
     */
    function redemptions(address account) external view returns (Redemption memory);

    /**
     * @notice Get amount of redemption available for withdraw for account
     * @param account Account
     * @param processedRedemptionQueue Current value of vault's processed
     * redemption queue
     * @return Amount available for withdraw
     */
    function redemptionAvailable(address account, uint256 processedRedemptionQueue) external view returns (uint256);
}
