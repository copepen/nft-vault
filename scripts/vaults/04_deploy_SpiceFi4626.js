const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626");
  const beacon = await upgrades.deployBeacon(SpiceFi4626, {
    unsafeAllow: ["delegatecall"],
  });
  await beacon.deployed();

  await deployments.save("SpiceFi4626", beacon);

  console.log(`SpiceFi4626 Beacon deployed to ${beacon.address}`);

  const implAddr = await beacon.implementation();

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: implAddr,
        contract: "contracts/vaults/SpiceFi4626.sol:SpiceFi4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
