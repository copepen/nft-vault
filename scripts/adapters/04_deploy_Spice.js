const hre = require("hardhat");

async function main() {
  const { ethers } = hre;

  // GOERLI ADDRESS: 0xb0F1Cd55CA8897306aEb53f671dD87125f5dBF0d
  const args = [
    "0xb0F1Cd55CA8897306aEb53f671dD87125f5dBF0d", // TODO: Spice Lending contract
  ];
  // const SpiceNoteAdapterFactory = await ethers.getContractFactory(
    // "SpiceNoteAdapter"
  // );
  // const adapter = await SpiceNoteAdapterFactory.deploy(...args);
  // await adapter.deployed();
// 
  // console.log(`Spice Note Adapter deployed to ${adapter.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: "0x3512d3a78a885CAcA73e68bAB4381C12049FE36F",
        contract: "contracts/integrations/Spice/SpiceNoteAdapter.sol:SpiceNoteAdapter",
        constructorArguments: args,
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
