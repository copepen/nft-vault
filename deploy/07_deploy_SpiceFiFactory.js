const deploy = async (hre) => {
  const { deployments, ethers } = hre;
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  const spiceVault = await deployments.get("SpiceFi4626");

  const factory = await deploy("SpiceFiFactory", {
    from: deployer.address,
    args: [spiceVault.implementation],
    log: true,
  });

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: factory.address,
        contract: "contracts/vaults/SpiceFiFactory.sol:SpiceFiFactory",
        constructorArguments: [spiceVault.implementation],
      });
    } catch (_) {}
  }
};

module.exports = deploy;

deploy.tags = ["SpiceFiFactory"];
deploy.dependencies = ["SpiceFi4626"];
