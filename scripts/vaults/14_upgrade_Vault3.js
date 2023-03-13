const hre = require("hardhat");

async function main() {
  const { ethers, upgrades, deployments } = hre;

  const beacon = await deployments.get("Vault3");
  const Vault = await ethers.getContractFactory("Vault");
  // await upgrades.forceImport("0xd7650014dBdB486154c1E86F73CC750cc280b6E3", Vault);
  const vault = await upgrades.upgradeBeacon(beacon.address, Vault);
  await vault.deployed();

  console.log("Vault successfully upgraded!");

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
