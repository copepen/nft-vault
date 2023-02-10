const { BigNumber, constants, utils } = require("ethers");

const LoanTerms = [
  {
    name: "lender",
    type: "address",
  },
  {
    name: "loanAmount",
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
    name: "collateralAddress",
    type: "address",
  },
  {
    name: "collateralId",
    type: "uint256",
  },
  {
    name: "borrower",
    type: "address",
  },
  {
    name: "expiration",
    type: "uint256",
  },
  {
    name: "currency",
    type: "address",
  },
  {
    name: "priceLiquidation",
    type: "bool",
  },
];

const signLoanTerms = async (signer, verifier, terms) => {
  const types = {
    LoanTerms,
  };
  return await sign(signer, verifier, types, terms);
};

const sign = async (signer, verifier, types, terms) => {
  const chainId = BigNumber.from(await signer.getChainId());
  const domain = {
    name: "Spice Finance",
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
    name: "Spice Finance",
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
    value: 10,
  };
  const hash = utils._TypedDataEncoder.hash(domain, types, data);
  const signature = await signer._signTypedData(domain, types, data);
  return [hash, signature];
};

module.exports = {
  signLoanTerms,
  signTestHashAndSignature,
};
