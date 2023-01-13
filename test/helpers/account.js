const { network } = require("hardhat");

const impersonateAccount = async (account) => {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [account],
  });
};

const setBalance = async (account, balance) => {
  await network.provider.request({
    method: "hardhat_setBalance",
    params: [account, balance],
  });
};

module.exports = {
  impersonateAccount,
  setBalance,
};
