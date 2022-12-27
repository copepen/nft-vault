const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const vaultAddress = "0xAb271E6fe425338A27883aeB195ea3f15364367b";
  const SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626");
  const impl = await upgrades.deployImplementation(SpiceFi4626);
  await upgrades.upgradeProxy(vaultAddress, SpiceFi4626, {
    unsafeAllow: ["delegatecall"],
  });

  console.log("SpiceFi4626 successfully upgraded!");

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: impl,
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
