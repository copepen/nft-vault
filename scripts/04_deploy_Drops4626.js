const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const args = [
    "sDrops",
    "sD1-ETH",
    hre.network.name === "mainnet"
      ? "0xD72929e284E8bc2f7458A6302bE961B91bccB339"
      : "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6",
    "0xe36A851fb975CedE659C91f4D783ea02b24Fae27",
  ];

  const Drops4626 = await ethers.getContractFactory("Drops4626");
  const vault = await upgrades.deployProxy(Drops4626, args, { kind: "uups" });

  await vault.deployed();

  console.log(`Drops4626 deployed to ${vault.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/vaults/Drops4626.sol:Drops4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
