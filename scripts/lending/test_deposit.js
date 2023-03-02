const hre = require("hardhat");
const config = require("./config");

async function main() {
  const { ethers } = hre;
  const signer = (await ethers.getSigners())[0];
  const chainId = await signer.getChainId();

  const loanId = 2;
  const payment = ethers.utils.parseEther("0.2");

  const SpiceLending = await ethers.getContractFactory("SpiceLending");
  const lending = SpiceLending.attach(config[chainId].lending);

  let tx = await lending.makeDeposit(loanId, payment);

  console.log("Deposit tx submitted: ", tx.hash);
  await tx.wait();
  console.log("Deposit success!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
