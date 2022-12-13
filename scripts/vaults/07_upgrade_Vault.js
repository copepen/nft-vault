const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const vaultAddress = "0x654afc120fa2d8d0788af07241c935f9e164544a";
  const Vault = await ethers.getContractFactory("Vault");
  await upgrades.upgradeProxy(vaultAddress, Vault);

  console.log("Vault successfully upgraded!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
