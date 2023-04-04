const hre = require("hardhat");

async function main() {
  const { ethers } = hre;

  const args = [
    "0x0C90C8B4aa8549656851964d5fB787F0e4F54082", // DirectLoanCoordinator
  ];
  // const NFTfiNoteAdapterFactory = await ethers.getContractFactory(
    // "NFTfiNoteAdapter"
  // );
  // const adapter = await NFTfiNoteAdapterFactory.deploy(...args);
  // await adapter.deployed();
  // await deployments.save("NftfiNoteAdapter", adapter);
  // console.log(`NFTfi Note Adapter deployed to ${adapter.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: "0x03e8254a18DD8F44C2606813dAA70e5cb5059D15",
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
