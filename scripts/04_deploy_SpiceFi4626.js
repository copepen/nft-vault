const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const deployer = (await ethers.getSigners())[0];

  const WETH =
    hre.network.name === "mainnet"
      ? "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" // mainnet weth
      : "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6"; // goerli weth
  const args = [WETH, deployer.address, deployer.address, 0];

  const SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626");
  const vault = await upgrades.deployProxy(SpiceFi4626, args, {
    unsafeAllow: ["delegatecall"],
    kind: "uups",
  });

  await vault.deployed();

  console.log(`SpiceFi4626 deployed to ${vault.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/vaults/SpiceFi4626.sol:SpiceFi4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
