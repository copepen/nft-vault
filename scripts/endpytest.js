fs = require("fs");
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { impersonateAccount } = require("../test/helpers/account");
const constants = require("../test/constants");

async function main() {
    await impersonateAccount(constants.accounts.Whale);
    whale = await ethers.getSigner(constants.accounts.Whale);
    const SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626");
    spiceVault = SpiceFi4626.attach('0x5A569Ad19272Afa97103fD4DbadF33B2FcbaA175');
    // withdraw initial funds into spice vault
    async function withdrawfunds() {
        const amount = ethers.utils.parseEther("1");
        await spiceVault.connect(whale)["withdraw(uint256,address,address)"](amount, whale.address, whale.address);
    }
    await withdrawfunds();
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});