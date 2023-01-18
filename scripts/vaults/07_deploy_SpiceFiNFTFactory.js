const hre = require("hardhat");
const constants = require("../../test/constants");

async function main() {
  const beacon = await deployments.get("SpiceFiNFT4626");
  const SpiceFiNFTFactory = await hre.ethers.getContractFactory("SpiceFiNFTFactory");
  const factory = await SpiceFiNFTFactory.deploy(
    beacon.address,
    constants.accounts.Dev,
    constants.accounts.Multisig,
    constants.accounts.Multisig
  );

  await factory.deployed();

  console.log(`SpiceFiNFTFactory deployed to ${factory.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: factory.address,
        contract: "contracts/vaults/SpiceFiNFTFactory.sol:SpiceFiNFTFactory",
        constructorArguments: [spiceVault],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
