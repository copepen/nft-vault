const hre = require("hardhat");

async function main() {
  const { ethers } = hre;

  // GOERLI ADDRESS: 0x37f8bBE2A9fc816AF6b6843eA0E2DA86289b81DE
  const args = [
    "0x37f8bBE2A9fc816AF6b6843eA0E2DA86289b81DE", // TODO: Spice Lending contract
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
        address: "0xD3CC63532a29B7721bf4df57B051d1B4806d120B",
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
