const hre = require("hardhat");

async function main() {
  const { ethers } = hre;

  const args = [
    "", // TODO: Spice Lending contract
  ];
  const SpiceNoteAdapterFactory = await ethers.getContractFactory(
    "SpiceNoteAdapter"
  );
  const adapter = await SpiceNoteAdapterFactory.deploy(...args);
  await adapter.deployed();

  console.log(`Spice Note Adapter deployed to ${adapter.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: adapter.address,
        contract:
          "contracts/integrations/Spice/SpiceNoteAdapter.sol:SpiceNoteAdapter",
        constructorArguments: args,
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
