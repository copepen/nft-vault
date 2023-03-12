const hre = require("hardhat");

async function main() {
  const { ethers, upgrades, deployments } = hre;

  const beacon = await deployments.get("SimpleVault");
  const SimpleVault = await ethers.getContractFactory("SimpleVault");
  const vault = await upgrades.upgradeBeacon(beacon.address, SimpleVault);
  await vault.deployed();

  console.log("SimpleVault successfully upgraded!");

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
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
