const deploy = async (hre) => {
  const { deployments, ethers } = hre;
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  const unwrapper = await deploy("WETHUnwrapper", {
    from: deployer.address,
    args: [],
    log: true,
  });

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: unwrapper.address,
        contract: "contracts/helpers/WETHUnwrapper.sol:WETHUnwrapper",
        constructorArguments: [],
      });
    } catch (_) {}
  }
};

module.exports = deploy;

deploy.tags = ["WETHUnwrapper"];
deploy.dependencies = [];
