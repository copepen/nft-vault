const { BigNumber, constants, utils } = require("ethers");

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

const ExtendLoanTerms = [
  {
    name: "baseTerms",
    type: "BaseTerms",
  },
  {
    name: "additionalPrincipal",
    type: "uint256",
  },
  {
    name: "newInterestRate",
    type: "uint160",
  },
  {
    name: "additionalDuration",
    type: "uint32",
  },
];

const IncreaseLoanTerms = [
  {
    name: "baseTerms",
    type: "BaseTerms",
  },
  {
    name: "additionalPrincipal",
    type: "uint256",
  },
  {
    name: "newInterestRate",
    type: "uint160",
  },
];

const signLoanTerms = async (signer, verifier, terms) => {
  const types = {
    LoanTerms,
    BaseTerms,
  };
  return await sign(signer, verifier, types, terms);
};

const signExtendLoanTerms = async (signer, verifier, terms) => {
  const types = {
    ExtendLoanTerms,
    BaseTerms,
  };
  return await sign(signer, verifier, types, terms);
};

const signIncreaseLoanTerms = async (signer, verifier, terms) => {
  const types = {
    IncreaseLoanTerms,
    BaseTerms,
  };
  return await sign(signer, verifier, types, terms);
};

const sign = async (signer, verifier, types, terms) => {
  const chainId = BigNumber.from(await signer.getChainId());
  const domain = {
    name: "SpiceLending",
    version: "1",
    chainId,
    verifyingContract: verifier,
  };
  const signature = await signer._signTypedData(domain, types, terms);
  return signature;
};

const signTestHashAndSignature = async (signer) => {
  const chainId = BigNumber.from(await signer.getChainId());
  const domain = {
    name: "SpiceLending",
    version: "1",
    chainId,
    verifyingContract: constants.AddressZero,
  };
  const types = {
    Test: [
      {
        name: "value",
        type: "uint256",
      },
    ],
  };
  const data = {
    value: 10
  };
  const hash = utils._TypedDataEncoder.hash(domain, types, data);
  const signature = await signer._signTypedData(domain, types, data);
  return [hash, signature];
};

module.exports = {
  signLoanTerms,
  signExtendLoanTerms,
  signIncreaseLoanTerms,
  signTestHashAndSignature,
};
