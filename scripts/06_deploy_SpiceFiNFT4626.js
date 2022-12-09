const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const deployer = (await ethers.getSigners())[0];

  const args = [deployer.address, deployer.address, 200];

  const SpiceFiNFT4626 = await ethers.getContractFactory("SpiceFiNFT4626");
  const vault = await upgrades.deployProxy(SpiceFiNFT4626, args, {
    unsafeAllow: ["delegatecall"],
    kind: "uups",
  });

  await vault.deployed();

  console.log(`SpiceFiNFT4626 deployed to ${vault.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/vaults/SpiceFiNFT4626.sol:SpiceFiNFT4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
