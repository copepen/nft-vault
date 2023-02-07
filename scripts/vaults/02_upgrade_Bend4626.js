const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const beacon = await deployments.get("Bend4626");
  const Bend4626 = await ethers.getContractFactory("Bend4626");
  const vault = await upgrades.upgradeBeacon(beacon.address, Bend4626, {'timeout': 0});
  await vault.deployed();

  console.log("Bend4626 successfully upgraded!");

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/vaults/Bend4626.sol:Bend4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
