const deploy = async (hre) => {
  const { deployments, ethers } = hre;
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  const args = [
    "sBend",
    "sbendWETH",
    "0x70b97A0da65C15dfb0FFA02aEE6FA36e507C2762",
    hre.network.name === "mainnet"
      ? "0xed1840223484483c0cb050e6fc344d1ebf0778a9"
      : "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6",
  ];

  const vault = await deploy("Bend4626", {
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
        contract: "contracts/vaults/Bend4626.sol:Bend4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
};

module.exports = deploy;

deploy.tags = ["Bend4626"];
deploy.dependencies = [];
