const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const SpiceFiNFT4626 = await ethers.getContractFactory("SpiceFiNFT4626");
  const beacon = await upgrades.deployBeacon(SpiceFiNFT4626, {
    unsafeAllow: ["delegatecall"],
  });
  await beacon.deployed();

  await deployments.save("SpiceFiNFT4626", beacon);

  console.log(`SpiceFiNFT4626 Beacon deployed to ${beacon.address}`);

  const implAddr = await beacon.implementation();

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: implAddr,
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
