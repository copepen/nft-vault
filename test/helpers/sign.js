const { BigNumber } = require("ethers");

const LoanTerms = [
  {
    name: "baseTerms",
    type: "BaseTerms",
  },
  {
    name: "principal",
    type: "uint256",
  },
  {
    name: "interestRate",
    type: "uint160",
  },
  {
    name: "duration",
    type: "uint32",
  },
  {
    name: "currency",
    type: "address",
  },
];

const BaseTerms = [
  {
    name: "collateralAddress",
    type: "address",
  },
  {
    name: "collateralId",
    type: "uint256",
  },
  {
    name: "expiration",
    type: "uint256",
  },
  {
    name: "lender",
    type: "address",
  },
  {
    name: "borrower",
    type: "address",
  },
];

const signLoanTerms = async (signer, verifier, terms) => {
  const chainId = BigNumber.from(await signer.getChainId());
  const domain = {
    name: "SpiceLending",
    version: "1",
    chainId,
    verifyingContract: verifier,
  };
  const types = {
    LoanTerms,
    BaseTerms,
  };
  const signature = await signer._signTypedData(domain, types, terms);
  return signature;
};

module.exports = {
  signLoanTerms,
};
