const hre = require("hardhat");
const config = require("./config");

async function main() {
  const { ethers } = hre;
  const signer = (await ethers.getSigners())[0];
  const chainId = await signer.getChainId();

  const SpiceLending = await ethers.getContractFactory("SpiceLending");
  const lending = SpiceLending.attach(config[chainId].lending);

  const loanId = 1;

  const tx = await lending.repay(loanId);
  console.log("Repay tx submitted: ", tx.hash);
  await tx.wait();
  console.log("Repay success!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
