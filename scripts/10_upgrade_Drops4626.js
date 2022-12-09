const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const vaultAddress = "0x8e44109d4979f6fa961fc27ffb8452360fc0b5b4";
  const Drops4626 = await ethers.getContractFactory("Drops4626");
  await upgrades.upgradeProxy(vaultAddress, Drops4626);

  console.log("Drops4626 successfully upgraded!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
