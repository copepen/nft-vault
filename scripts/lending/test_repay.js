const hre = require("hardhat");

async function main() {
  const { ethers } = hre;

  const SpiceLending = await ethers.getContractFactory("SpiceLending");
  const lending = SpiceLending.attach(
    "0x6a3F93048661192aEd72cd8472414eE8502a14A4"
  );

  const loanId = 0;

  const gasLimit = await lending.estimateGas.repay(loanId);
  const tx = await lending.repay(loanId, {
    gasLimit: gasLimit.mul(105).div(100),
  });
  console.log("Repay tx submitted: ", tx.hash);
  await tx.wait();
  console.log("Repay success!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
