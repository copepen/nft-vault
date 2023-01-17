const hre = require("hardhat");
const constants = require("../../test/constants");

async function main() {
  const beacon = await deployments.get("SpiceFi4626");
  const SpiceFiFactory = await hre.ethers.getContractFactory("SpiceFiFactory");
  const factory = await SpiceFiFactory.deploy(
    beacon.address,
    constants.accounts.Dev,
    constants.accounts.Multisig,
    constants.accounts.Dev
  );

  await factory.deployed();

  console.log(`SpiceFiFactory deployed to ${factory.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: factory.address,
        contract: "contracts/vaults/SpiceFiFactory.sol:SpiceFiFactory",
        constructorArguments: [spiceVault],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
