const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const beacon = await deployments.get("Blur4626");
  const Blur4626 = await ethers.getContractFactory("Blur4626");
  const vault = await upgrades.upgradeBeacon(beacon.address, Blur4626);
  await vault.deployed();

  console.log("Blur4626 successfully upgraded!");

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/vaults/Blur4626.sol:Blur4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
