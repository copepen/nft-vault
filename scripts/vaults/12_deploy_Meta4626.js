const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const args = [
    "sMeta",
    "smWETH",
    "0x7770cD73e035C37BDf8875eEE81577c63202Ab8d", // meta pool
  ];

  const Meta4626 = await ethers.getContractFactory("Meta4626");
  const beacon = await upgrades.deployBeacon(Meta4626, {timeout: 0});
  await beacon.deployed();
  await deployments.save("Meta4626", beacon);

  const vault = await upgrades.deployBeaconProxy(beacon, Meta4626, args, {timeout: 0});
  await vault.deployed();

  console.log(`Meta4626 deployed to ${vault.address}`);

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
