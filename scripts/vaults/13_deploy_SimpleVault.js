const hre = require("hardhat");

async function main() {
  const { ethers, upgrades, deployments } = hre;

  const SimpleVault = await ethers.getContractFactory("SimpleVault");
  const beacon = await upgrades.deployBeacon(SimpleVault);
  await beacon.deployed();

  await deployments.save("SimpleVault", beacon);

  console.log(`SimpleVault Beacon deployed to ${beacon.address}`);

  const implAddr = await beacon.implementation();

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: implAddr,
        contract: "contracts/vaults/SimpleVault.sol:SimpleVault",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});