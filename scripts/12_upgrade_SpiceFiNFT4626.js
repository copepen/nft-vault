const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const vaultAddress = "0x3ad4119e2beb50944723eccb3d4e4424e182be47";
  const SpiceFiNFT4626 = await ethers.getContractFactory("SpiceFiNFT4626");
  await upgrades.upgradeProxy(vaultAddress, SpiceFiNFT4626, {
    unsafeAllow: ["delegatecall"],
  });

  console.log("SpiceFiNFT4626 successfully upgraded!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
