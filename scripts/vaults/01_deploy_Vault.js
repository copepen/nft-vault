const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const WETH =
    hre.network.name === "mainnet"
      ? "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" // mainnet weth
      : "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6"; // goerli weth
  const args = ["Spice Peer2Peer", "SPP", WETH, 0];

  const Vault = await ethers.getContractFactory("Vault");
  const vault = await upgrades.deployProxy(Vault, args, { kind: "uups" });

  await vault.deployed();

  console.log(`Vault deployed to ${vault.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/vaults/Vault.sol:Vault",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
