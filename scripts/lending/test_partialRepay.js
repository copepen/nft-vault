const hre = require("hardhat");
const config = require("./config");

async function main() {
  const { ethers } = hre;
  const signer = (await ethers.getSigners())[0];
  const chainId = await signer.getChainId();

  const loanId = 1;
  const payment = ethers.utils.parseEther("0.02");

  const SpiceLending = await ethers.getContractFactory("SpiceLending");
  const lending = SpiceLending.attach(config[chainId].lending);

  let tx = await lending.partialRepay(loanId, payment);
  console.log("PartialRepay tx submitted: ", tx.hash);
  await tx.wait();
  console.log("Partial repay success!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
