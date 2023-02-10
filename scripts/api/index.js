const axios = require("axios");
require("dotenv").config();

const BASE_URL = process.env.API_BASE_URL;
const API_KEY = process.env.API_KEY;

const getLoanTerms = async (
  terms,
  signature,
  requestType,
  chainId = 1,
  loanId = -1
) => {
  const requestBody = {
    signature,
    loanterms: terms,
    requestType,
    chainId,
  };
  if (loanId !== -1) {
    requestBody.loanId = loanId;
  }
  return await axios.post(
    `${BASE_URL}/oracle/loan/spice`,
    JSON.stringify(requestBody),
    {
      headers: {
        "Content-Type": "application/json",
        "api-key": API_KEY,
      },
    }
  );
};

module.exports = {
  getLoanTerms,
};
