const increaseTime = async (t) => {
  await ethers.provider.send("evm_increaseTime", [t]);
  await ethers.provider.send("evm_mine");
};

module.exports = {
  increaseTime,
};
