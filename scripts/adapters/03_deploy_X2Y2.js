const hre = require("hardhat");

async function main() {
  const { ethers } = hre;

  const args = [
    "0x21A619115F36dE1A71B549e9081022fe84136f65", //"0xFa4D5258804D7723eb6A934c11b1bd423bC31623", //"0xC28F7Ee92Cd6619e8eEC6A70923079fBAFb86196", // XY3
  ];
  const X2Y2NoteAdapterFactory = await ethers.getContractFactory(
    "X2Y2NoteAdapter"
  );
  const adapter = await X2Y2NoteAdapterFactory.deploy(...args);
  await adapter.deployed();
  await deployments.save("X2Y2NoteAdapter", adapter);
  console.log(`X2Y2 Note Adapter deployed to ${adapter.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: adapter.address,
        contract:
          "contracts/integrations/X2Y2/X2Y2NoteAdapter.sol:X2Y2NoteAdapter",
        constructorArguments: args,
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
