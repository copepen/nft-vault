const hre = require("hardhat");
const { getLoanTerms } = require("../api");
const { LoanTermsRequestType } = require("../constants");

async function main() {
  const { ethers } = hre;
  const signer = (await ethers.getSigners())[0];
  const chainId = await signer.getChainId();

  const domain = {
    name: "Spice Finance",
    version: "1",
    chainId,
  };

  const SpiceFiNFT4626 = await ethers.getContractFactory("SpiceFiNFT4626");
  const vault = SpiceFiNFT4626.attach(
    "0xc118f4bF7f156F3B2027394f2129f32C03FbB1D4"
  );
  const terms = {
    loanAmount: ethers.utils.parseEther("0.1").toString(),
    duration: (10 * 24 * 3600).toString(), // 10 days
    collateralAddress: vault.address,
    collateralId: 4,
    borrower: signer.address,
    currency: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
    additionalLoanAmount: "",
    additionalDuration: "",
  };
  const types = {
    LoanTerms: LoanTermsRequestType,
  };
  const signature = await signer._signTypedData(domain, types, terms);
  const res = await getLoanTerms(terms, signature, "initiate", chainId);

  const SpiceLending = await ethers.getContractFactory("SpiceLending");
  const lending = SpiceLending.attach(
    "0x6a3F93048661192aEd72cd8472414eE8502a14A4"
  );

  const loanterms = {
    ...res.data.loanterms,
    loanAmount: ethers.BigNumber.from(res.data.loanterms.loanAmount.toString()),
  };
  delete loanterms.repayment;

  const loanId = await lending.callStatic.initiateLoan(
    loanterms,
    res.data.signature
  );
  const tx = await lending.initiateLoan(loanterms, res.data.signature);
  await tx.wait();
  console.log(`New loan initiated with loan ID ${loanId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
