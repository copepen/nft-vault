const hre = require("hardhat");

async function main() {
  const { ethers } = hre;

  const args = [
    "0x81b2F8Fc75Bab64A6b144aa6d2fAa127B4Fa7fD9", // LoanCore
    "0xb39dAB85FA05C381767FF992cCDE4c94619993d4", // RepaymentController
    "0xFDda20a20cb4249e73e3356f468DdfdfB61483F6", // VaultDepositRouter
  ];
  const ArcadeNoteAdapterFactory = await ethers.getContractFactory(
    "ArcadeNoteAdapter"
  );
  const adapter = await ArcadeNoteAdapterFactory.deploy(...args);
  await adapter.deployed();

  console.log(`Arcade Note Adapter deployed to ${adapter.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: adapter.address,
        contract:
          "contracts/integrations/Arcade/ArcadeNoteAdapter.sol:ArcadeNoteAdapter",
        constructorArguments: args,
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
