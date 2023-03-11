const hre = require("hardhat");

async function main() {
  // const { ethers, upgrades } = hre;
// 
  // const beacon = await deployments.get("SpiceFiNFT4626");
  // const SpiceFiNFT4626 = await ethers.getContractFactory("SpiceFiNFT4626");
  // const vault = await upgrades.upgradeBeacon(beacon.address, SpiceFiNFT4626, {
    // unsafeAllow: ["delegatecall"],
    // timeout: 0
  // });
  // await vault.deployed();
// 
  // console.log(`SpiceFiNFT4626 successfully upgraded to ${vault.address}!`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: "0xEDb66190A2283dfc182e7c3f48EfcB204ab4D7D2",
        contract: "contracts/vaults/SpiceFiNFT4626.sol:SpiceFiNFT4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
