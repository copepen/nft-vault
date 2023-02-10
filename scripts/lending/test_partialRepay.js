const hre = require("hardhat");

async function main() {
  const { ethers } = hre;

  const loanId = 0;
  const payment = ethers.utils.parseEther("0.02");

  const SpiceLending = await ethers.getContractFactory("SpiceLending");
  const lending = SpiceLending.attach(
    "0x6a3F93048661192aEd72cd8472414eE8502a14A4"
  );
  const ERC20 = await ethers.getContractFactory("ERC20");
  const asset = ERC20.attach(
    (await lending.getLoanData(loanId)).terms.currency
  );
  let gasLimit = await asset.estimateGas.approve(lending.address, payment);
  let tx = await asset.approve(lending.address, payment, {
    gasLimit: gasLimit.mul(105).div(100),
  });
  console.log("Apprve tx submitted: ", tx.hash);
  await tx.wait();
  console.log("Approve asset success!");

  gasLimit = await lending.estimateGas.partialRepay(loanId, payment);
  tx = await lending.partialRepay(loanId, payment, {
    gasLimit: gasLimit.mul(105).div(100),
  });
  console.log("PartialRepay tx submitted: ", tx.hash);
  await tx.wait();
  console.log("Partial repay success!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
