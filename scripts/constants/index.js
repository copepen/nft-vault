const LoanTermsRequestType = [
  {
    name: "loanAmount",
    type: "uint256",
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
    name: "currency",
    type: "address",
  },
  {
    name: "additionalLoanAmount",
    type: "uint256",
  },
  {
    name: "additionalDuration",
    type: "uint32",
  },
];

module.exports = {
  LoanTermsRequestType,
};
