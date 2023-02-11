const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const args = [
    "sDrops",
    "sD1-ETH",
    "0xD72929e284E8bc2f7458A6302bE961B91bccB339",
  ];

  const Drops4626 = await ethers.getContractFactory("Drops4626");
  const beacon = await upgrades.deployBeacon(Drops4626);
  await beacon.deployed();

  await deployments.save("Drops4626", beacon);

  const vault = await upgrades.deployBeaconProxy(beacon, Drops4626, args);
  await vault.deployed();

  console.log(`Drops4626 deployed to ${vault.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
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
