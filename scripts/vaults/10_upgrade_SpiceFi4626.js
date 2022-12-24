const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const vaultAddress = "0xAb271E6fe425338A27883aeB195ea3f15364367b";
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
