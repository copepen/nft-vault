const hre = require("hardhat");
const config = require("./config");

async function main() {
  const { ethers } = hre;
  const signer = (await ethers.getSigners())[0];
  const chainId = await signer.getChainId();

  const SpiceLending = await ethers.getContractFactory("SpiceLending");
  const lending = SpiceLending.attach(config[chainId].lending);

  const loanId = 1;

  const gasLimit = await lending.estimateGas.liquidate(loanId);
  const tx = await lending.liquidate(loanId, {
    gasLimit: gasLimit.mul(105).div(100),
  });
  console.log("Liquidate tx submitted: ", tx.hash);
  await tx.wait();
  console.log("Liquidate success!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
