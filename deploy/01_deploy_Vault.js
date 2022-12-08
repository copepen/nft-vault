const deploy = async (hre) => {
  const { deployments, ethers } = hre;
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  const WETH =
    hre.network.name === "mainnet"
      ? "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" // mainnet weth
      : "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6"; // goerli weth
  const args = ["Spice Peer2Peer", "SPP", WETH, 0];

  const vault = await deploy("Vault", {
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
        contract: "contracts/vaults/Vault.sol:Vault",
        constructorArguments: [],
      });
    } catch (_) {}
  }
};

module.exports = deploy;

deploy.tags = ["Vault"];
deploy.dependencies = [];
