function similar(a, b) {
  MARGIN_OF_ERROR = 0.0000000001
  let diff = Math.abs(a - b);
  let smallest = Math.min(Math.abs(a), Math.abs(b));
  let ratio = diff / smallest;
  return ratio < MARGIN_OF_ERROR;
}

const compareTerms = (termsA, termsB) => {
  if (termsA.lender.toLowerCase() != termsB.lender.toLowerCase()) {
    console.log(termsA.lender.toLowerCase(), termsB.lender.toLowerCase());
    console.log("'lender' is different");
  }
  if (termsA.borrower.toLowerCase() != termsB.borrower.toLowerCase()) {
    console.log(termsA.borrower.toLowerCase(), termsB.borrower.toLowerCase());
    console.log("'borrower' is different");
  }
  if (!similar(termsA.loanAmount, termsB.loanAmount)) {
    console.log(termsA.loanAmount, termsB.loanAmount);
    console.log("'loanAmount' is different");
  }
  if (termsA.interestRate != termsB.interestRate) {
    console.log(termsA.interestRate, termsB.interestRate);
    console.log("'interestRate' is different");
  }
  if (termsA.duration != termsB.duration) {
    console.log(termsA.duration, termsB.duration);
    console.log("'duration' is different");
  }
  if (
    termsA.collateralAddress.toLowerCase() !=
    termsB.collateralAddress.toLowerCase()
  ) {
    console.log(
      termsA.collateralAddress.toLowerCase(),
      termsB.collateralAddress.toLowerCase()
    );
    console.log("'collateralAddress' is different");
  }
  if (termsA.collateralId != termsB.collateralId) {
    console.log(termsA.collateralId, termsB.collateralId);
    console.log("'collateralId' is different");
  }
  if (termsA.currency.toLowerCase() != termsB.currency.toLowerCase()) {
    console.log(termsA.currency.toLowerCase(), termsB.currency.toLowerCase());
    console.log("'currency' is different");
  }
  if (termsA.priceLiquidation != termsB.priceLiquidation) {
    console.log(termsA.priceLiquidation, termsB.priceLiquidation);
    console.log("'priceLiquidation' is different");
  }
};

module.exports = {
  compareTerms,
};
