const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const mainbeacon = await deployments.get("SpiceLending");
  const beacon = mainbeacon.address;
  // const beacon = "0x44Caf1C51A8Db5f9F8057A11560e7d66E50635D6";
  const SpiceLending = await ethers.getContractFactory("SpiceLending");
  const vault = await upgrades.upgradeBeacon(beacon, SpiceLending, {'timeout': 0});
  await vault.deployed();

  console.log("SpiceLending successfully upgraded!");

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/lending/SpiceLending.sol:SpiceLending",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
