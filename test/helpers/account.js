const { network } = require("hardhat");

const impersonateAccount = async (account) => {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [account],
  });
};

module.exports = {
  impersonateAccount,
};
