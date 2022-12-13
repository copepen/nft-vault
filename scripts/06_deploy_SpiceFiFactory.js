const hre = require("hardhat");

async function main() {
  const spiceVault = "0x688C031752680Fc5D8202888cF43A3C8399cF893";

  const SpiceFiFactory = await hre.ethers.getContractFactory("SpiceFiFactory");
  const factory = await SpiceFiFactory.deploy(spiceVault);

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
