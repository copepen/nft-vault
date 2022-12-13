const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const vaultAddress = "0x0743be73d48dc949f8d097a40a1e194657960f80";
  const SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626");
  await upgrades.upgradeProxy(vaultAddress, SpiceFi4626, {
    unsafeAllow: ["delegatecall"],
  });

  console.log("SpiceFi4626 successfully upgraded!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
