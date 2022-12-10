const hre = require("hardhat");

async function main() {
  const WETHUnwrapper = await hre.ethers.getContractFactory("WETHUnwrapper");
  const unwrapper = await WETHUnwrapper.deploy();

  await unwrapper.deployed();

  console.log(`WETHUnwrapper deployed to ${unwrapper.address}`);

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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
