const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  // const beacon = await deployments.get("Drops4626");
  // const Drops4626 = await ethers.getContractFactory("Drops4626");
  // const vault = await upgrades.upgradeBeacon(beacon.address, Drops4626, {'timeout': 0});
  // await vault.deployed();
// 
  // console.log(`Drops4626 successfully upgraded!`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: "0xfE58706c68D900FD9bfE5E5f0d435204C500CAFb",
        contract: "contracts/vaults/Drops4626.sol:Drops4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
