const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const beacon = await deployments.get("SpiceFi4626");
  const SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626");
  const vault = await upgrades.upgradeBeacon(beacon.address, SpiceFi4626, {
    unsafeAllow: ["delegatecall"],
    timeout: 0
  });
  await vault.deployed();

  console.log(`SpiceFi4626 successfully upgraded to ${vault.address}!`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
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
