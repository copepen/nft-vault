const deploy = async (hre) => {
  const { deployments, ethers } = hre;
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  const unwrapper = await deployments.get("WETHUnwrapper");
  const args = [
    "sDrops",
    "sD1-ETH",
    hre.network.name === "mainnet"
      ? "0xD72929e284E8bc2f7458A6302bE961B91bccB339"
      : "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6",
    unwrapper.address,
  ];

  const vault = await deploy("Drops4626", {
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
        contract: "contracts/vaults/Drops4626.sol:Drops4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
};

module.exports = deploy;

deploy.tags = ["Drops4626"];
deploy.dependencies = ["WETHUnwrapper"];
