const { Assertion } = require("chai");

Assertion.addMethod("withinWei", function (amount, wei = 1) {
  let obj = this._obj;
  this.assert(
    obj.gte(amount.sub(wei)) && obj.lte(amount.add(wei)),
    "expected #{this} to be be within one wei of #{exp} but got #{act}",
    "expected #{this} to not be within one wei of #{exp}",
    amount.toString(), // expected
    obj.toString() // actual
  );
});
