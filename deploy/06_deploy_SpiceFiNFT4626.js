const deploy = async (hre) => {
  const { deployments, ethers } = hre;
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  const args = [deployer.address, deployer.address, 200];

  const vault = await deploy("SpiceFiNFT4626", {
    from: deployer.address,
    args: [],
    log: true,
    proxy: {
      proxyContract: "UUPS",
      execute: {
        methodName: "initialize",
        args,
      },
    },
  });

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/vaults/SpiceFiNFT4626.sol:SpiceFiNFT4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
};

module.exports = deploy;

deploy.tags = ["SpiceFiNFT4626"];
deploy.dependencies = [];
