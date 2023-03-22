const hre = require("hardhat");
const constants = require("../../test/constants");

async function main() {
  const { ethers, upgrades, deployments } = hre;

  const accounts = await ethers.getSigners();
  console.log(accounts[0].address);

  const lenderNoteArgs = ["Spice Lender Note", "SLN"];
  const borrowerNoteArgs = ["Spice Borrower Note", "SBN"];

  const Note = await ethers.getContractFactory("Note");

  // const lenderNote = await Note.deploy(...lenderNoteArgs);
  // await lenderNote.deployed();
  // console.log(`LenderNote deployed to ${lenderNote.address}`);
  const lenderNote = Note.attach('0x91Cbd2ad678ad3B955e4C1f78eceD151871F84cc');

  // const borrowerNote = await Note.deploy(...borrowerNoteArgs);
  // await borrowerNote.deployed();
  // console.log(`BorrowerNote deployed to ${borrowerNote.address}`);
  const borrowerNote = Note.attach('0xfa852E8Adc3d36Ca4187c0D177Fcc9013861fA8f');

  const SpiceLending = await ethers.getContractFactory("SpiceLending");
  const beacon = await upgrades.deployBeacon(SpiceLending);
  await beacon.deployed();

  await deployments.save("SpiceLending", beacon);

  const args = [
    constants.accounts.Dev, // signer address
    lenderNote.address, // lender note address
    borrowerNote.address, // borrower note address
    1000, // interest fee
    8000, // liquidation ratio
    1000, // liquidation fee
    40000, // loan ratio
    accounts[0].address, // fee recipient
  ];

  const lending = await upgrades.deployBeaconProxy(beacon, SpiceLending, args);
  await lending.deployed();

  console.log(`SpiceLending deployed to ${lending.address}`);

  await lenderNote.initialize(lending.address, true);
  await borrowerNote.initialize(lending.address, false);

  const implAddr = await beacon.implementation();

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: implAddr,
        contract: "contracts/lending/SpiceLending.sol:SpiceLending",
        constructorArguments: [],
      });
    } catch (_) {}
    try {
      await hre.run("verify:verify", {
        address: lending.address,
        contract: "contracts/lending/SpiceLending.sol:SpiceLending",
        constructorArguments: [],
      });
    } catch (_) {}
    try {
      await hre.run("verify:verify", {
        address: lenderNote.address,
        contract: "contracts/lending/Note.sol:Note",
        constructorArguments: lenderNoteArgs,
      });
    } catch (_) {}
    try {
      await hre.run("verify:verify", {
        address: borrowerNote.address,
        contract: "contracts/lending/Note.sol:Note",
        constructorArguments: borrowerNoteArgs,
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
