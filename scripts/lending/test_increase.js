const hre = require("hardhat");
const { getLoanTerms } = require("../api");
const { LoanTermsRequestType } = require("../constants");
const { compareTerms } = require("./util");
const config = require("./config");

async function main() {
  const { ethers } = hre;
  const signer = (await ethers.getSigners())[0];
  const chainId = await signer.getChainId();

  const domain = {
    name: "Spice Finance",
    version: "1",
    chainId,
  };

  const loanId = 5;

  const SpiceFiNFT4626 = await ethers.getContractFactory("SpiceFiNFT4626");
  const vault = SpiceFiNFT4626.attach(config[chainId].prologue);
  const terms = {
    loanAmount: ethers.utils.parseEther("0.1").toString(),
    duration: (10 * 24 * 3600).toString(), // 10 days
    collateralAddress: vault.address,
    collateralId: 82,
    borrower: signer.address,
    currency: config[chainId].weth,
    additionalLoanAmount: ethers.utils.parseEther("0.01").toString(),
    additionalDuration: 0,
  };
  const types = {
    LoanTerms: LoanTermsRequestType,
  };
  const signature = await signer._signTypedData(domain, types, terms);
  const res = await getLoanTerms(terms, signature, "increase", chainId, loanId);

  const SpiceLending = await ethers.getContractFactory("SpiceLending");
  const lending = SpiceLending.attach(config[chainId].lending);

  const loanterms = {
    ...res.data.loanterms,
    loanAmount: ethers.BigNumber.from(res.data.loanterms.loanAmount.toString()),
  };
  delete loanterms.repayment;

  let data = await lending.getLoanData(loanId);

  if (!loanterms.lender || !ethers.utils.isAddress(loanterms.lender)) {
    console.log("'lender' is missing or invalid");
    return;
  }
  if (loanterms.borrower != terms.borrower) {
    console.log("'borrower' changed");
    return;
  }
  if (
    loanterms.loanAmount.lt(
      data.balance.add(data.interestAccrued).add(terms.additionalLoanAmount)
    )
  ) {
    console.log("'loanAmount' is invalid");
    return;
  }
  if (!loanterms.interestRate) {
    console.log("'interestRate' is missing");
    return;
  }
  if (loanterms.collateralAddress != terms.collateralAddress) {
    console.log("'collateralAddress' changed");
    return;
  }
  if (loanterms.collateralId != terms.collateralId) {
    console.log("'collateralAddress' changed");
    return;
  }
  if (
    !loanterms.expiration ||
    loanterms.expiration < Math.floor(Date.now() / 1000)
  ) {
    console.log("'expiration' is missing or invalid");
    return;
  }
  if (loanterms.currency != terms.currency) {
    console.log("'currency' is missing");
    return;
  }
  if (
    loanterms.priceLiquidation == undefined ||
    typeof loanterms.priceLiquidation != "boolean"
  ) {
    console.log("'priceLiquidation' is missing or invalid");
    return;
  }

  const tx = await lending.updateLoan(loanId, loanterms, res.data.signature);
  console.log("Increase tx submitted: ", tx.hash);
  await tx.wait();
  console.log(`Loan #${loanId} has been increased!`);

  data = await lending.getLoanData(loanId);
  compareTerms(loanterms, data.terms);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
