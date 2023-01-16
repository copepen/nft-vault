const hre = require("hardhat");
const constants = require("../../test/constants");

async function main() {
  const { ethers, upgrades } = hre;

  const deployer = (await ethers.getSigners())[0];

  const args = [
    deployer.address,             // strategist
    deployer.address,             // asset receiver
    200,                          // withdrawal fee
    constants.accounts.Multisig,  // multisig
    constants.accounts.Multisig   // fee recipient
  ];

  const SpiceFiNFT4626 = await ethers.getContractFactory("SpiceFiNFT4626");
  const beacon = await upgrades.deployBeacon(SpiceFiNFT4626, {
    unsafeAllow: ["delegatecall"],
  });
  await beacon.deployed();

  await deployments.save("SpiceFiNFT4626", beacon);

  const vault = await upgrades.deployBeaconProxy(beacon, SpiceFiNFT4626, args);
  await vault.deployed();

  console.log(`SpiceFiNFT4626 deployed to ${vault.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/vaults/SpiceFiNFT4626.sol:SpiceFiNFT4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
