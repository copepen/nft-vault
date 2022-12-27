const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const vaultAddress = "0x654afc120fa2d8d0788af07241c935f9e164544a";
  const Vault = await ethers.getContractFactory("Vault");
  const impl = await upgrades.deployImplementation(Vault);
  await upgrades.upgradeProxy(vaultAddress, Vault);

  console.log("Vault successfully upgraded!");

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: impl,
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
