const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const vaultAddress = "0x9f89770af1da5df1b1cbf09b8ee954a2c29b0259";
  const Bend4626 = await ethers.getContractFactory("Bend4626");
  const impl = await upgrades.deployImplementation(Bend4626);
  await upgrades.upgradeProxy(vaultAddress, Bend4626);

  console.log("Bend4626 successfully upgraded!");

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: impl,
        contract: "contracts/vaults/Bend4626.sol:Bend4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
