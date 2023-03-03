const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const beacon = await deployments.get("Meta4626");
  const Meta4626 = await ethers.getContractFactory("Meta4626");
  const vault = await upgrades.upgradeBeacon(beacon.address, Meta4626);
  await vault.deployed();

  console.log("Meta4626 successfully upgraded!");

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/vaults/Meta4626.sol:Meta4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
