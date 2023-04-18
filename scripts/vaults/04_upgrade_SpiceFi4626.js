const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  // const beacon = await deployments.get("SpiceFi4626");
  // const SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626");
  // const vault = await upgrades.upgradeBeacon(beacon.address, SpiceFi4626, {
    // unsafeAllow: ["delegatecall"], 
    // timeout: 0
  // });
  // await vault.deployed();
// 
  // console.log(`SpiceFi4626 successfully upgraded to ${vault.address}!`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: "0x484b3673dB0bDC785129Ae395d8C408095622996",
        contract: "contracts/vaults/SpiceFi4626.sol:SpiceFi4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
