const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const beacon = await deployments.get("Para4626");
  const Para4626 = await ethers.getContractFactory("Para4626");
  const vault = await upgrades.upgradeBeacon(beacon.address, Para4626);
  await vault.deployed();

  console.log("Para4626 successfully upgraded!");

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/vaults/Para4626.sol:Para4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
