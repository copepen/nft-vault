const hre = require("hardhat");
const constants = require("../../test/constants");

async function main() {
  const beacon = await deployments.get("Vault");
  const spiceFactory = await deployments.get("SpiceFiFactory");
  const VaultFactory = await hre.ethers.getContractFactory("VaultFactory");
  const factory = await VaultFactory.deploy(
    beacon.address,
    spiceFactory.address,
    constants.accounts.Dev,
    constants.accounts.Multisig,
    constants.accounts.Multisig
  );

  await factory.deployed();

  console.log(`VaultFactory deployed to ${factory.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: factory.address,
        contract: "contracts/vaults/VaultFactory.sol:VaultFactory",
        constructorArguments: [spiceVault],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});