const hre = require("hardhat");

async function main() {
  const { ethers } = hre;

  const args = [
    "0x0C90C8B4aa8549656851964d5fB787F0e4F54082", // DirectLoanCoordinator
  ];
  const NFTfiNoteAdapterFactory = await ethers.getContractFactory(
    "NFTfiNoteAdapter"
  );
  const adapter = await NFTfiNoteAdapterFactory.deploy(...args);
  await adapter.deployed();

  console.log(`NFTfi Note Adapter deployed to ${adapter.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: adapter.address,
        contract:
          "contracts/integrations/NFTfi/NFTfiNoteAdapter.sol:NFTfiNoteAdapter",
        constructorArguments: args,
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
