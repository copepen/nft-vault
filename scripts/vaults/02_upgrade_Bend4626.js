const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  // const beacon = await deployments.get("Bend4626");
  // const Bend4626 = await ethers.getContractFactory("Bend4626");
  // const vault = await upgrades.upgradeBeacon(beacon.address, Bend4626, {'timeout': 0});
  // await vault.deployed();
// 
  // console.log(`${vault}`);
  // console.log("Bend4626 successfully upgraded!");

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: "0xaD8a73990dd9a220b05B2F7b1b16D781E3c5682E",
        contract: "contracts/vaults/Bend4626.sol:Bend4626",
        constructorArguments: [],
      });
    } catch (_) {
      console.log("error")
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
