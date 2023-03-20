// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

interface IMetaVault {
    /**
     * @notice Tranche identifier
     */
    enum TrancheId {
        Senior,
        Junior
    }

    /**
     * @notice Get LP token
     * @param trancheId Tranche
     * @return LP token contract
     */
    function lpToken(TrancheId trancheId) external view returns (address);

    /**
     * @notice Get share price
     * @param trancheId Tranche
     * @return Share price in UD60x18
     */
    function sharePrice(TrancheId trancheId) external view returns (uint256);

    /**
     * @notice Get redemption share price
     * @param trancheId Tranche
     * @return Redemption share price in UD60x18
     */
    function redemptionSharePrice(TrancheId trancheId) external view returns (uint256);

    /**
     * @notice Deposit currency into a tranche in exchange for LP tokens
     *
     * Emits a {Deposited} event.
     *
     * @param trancheId Tranche
     * @param amount Amount of currency tokens
     */
    function deposit(TrancheId trancheId, uint256 amount) external;

    /**
     * @notice Redeem LP tokens in exchange for currency tokens. Currency
     * tokens can be withdrawn with the `withdraw()` method, once the
     * redemption is processed.
     *
     * Emits a {Redeemed} event.
     *
     * @param trancheId Tranche
     * @param shares Amount of LP tokens
     */
    function redeem(TrancheId trancheId, uint256 shares) external;

    /**
     * @notice Withdraw redeemed currency tokens
     *
     * Emits a {Withdrawn} event.
     *
     * @param trancheId Tranche
     * @param maxAmount Maximum amount of currency tokens to withdraw
     */
    function withdraw(TrancheId trancheId, uint256 maxAmount) external;
}
