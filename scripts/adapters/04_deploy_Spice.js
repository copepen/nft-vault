const hre = require("hardhat");

async function main() {
  const { ethers } = hre;

  // GOERLI ADDRESS: 0xb0F1Cd55CA8897306aEb53f671dD87125f5dBF0d
  // MAINNET ADDRESS: 0x5d28a7AF78635d4f4C0BF5C404241A941A7EbD0A
  const args = [
    "0x5d28a7AF78635d4f4C0BF5C404241A941A7EbD0A",
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
        address: "0x9eb45cF7C162c1f3CA6dE5024CC9Ef14821c603B",
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
