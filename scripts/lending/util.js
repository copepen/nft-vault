const comapreTerms = (termsA, termsB) => {
  if (termsA.lender.toLowerCase() != termsB.lender.toLowerCase()) {
    console.log("'lender' is different");
  }
  if (termsA.borrower.toLowerCase() != termsB.borrower.toLowerCase()) {
    console.log("'borrower' is different");
  }
  if (!termsA.loanAmount.eq(termsB.loanAmount)) {
    console.log("'loanAmount' is different");
  }
  if (!termsA.interestRate.eq(termsB.interestRate)) {
    console.log("'interestRate' is different");
  }
  if (termsA.duration != termsB.duration) {
    console.log("'duration' is different");
  }
  if (
    termsA.collateralAddress.toLowerCase() !=
    termsB.collateralAddress.toLowerCase()
  ) {
    console.log("'collateralAddress' is different");
  }
  if (!termsA.collateralId.eq(termsB.collateralId)) {
    console.log("'collateralId' is different");
  }
  if (termsA.currency.toLowerCase() != termsB.currency.toLowerCase()) {
    console.log("'currency' is different");
  }
  if (termsA.priceLiquidation != termsB.priceLiquidation) {
    console.log("'priceLiquidation' is different");
  }
};

module.exports = {
  comapreTerms,
};
