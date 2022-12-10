const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const vaultAddress = "0x9f89770af1da5df1b1cbf09b8ee954a2c29b0259";
  const Bend4626 = await ethers.getContractFactory("Bend4626");
  await upgrades.upgradeProxy(vaultAddress, Bend4626);

  console.log("Bend4626 successfully upgraded!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
