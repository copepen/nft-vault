const hre = require("hardhat");

async function main() {
  const { ethers, upgrades, deployments } = hre;

  const Vault = await ethers.getContractFactory("Vault");
  const beacon = await upgrades.deployBeacon(Vault);
  await beacon.deployed();

  await deployments.save("Vault", beacon);

  console.log(`Vault Beacon deployed to ${beacon.address}`);

  const implAddr = await beacon.implementation();

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: implAddr,
        contract: "contracts/vaults/Vault.sol:Vault",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
