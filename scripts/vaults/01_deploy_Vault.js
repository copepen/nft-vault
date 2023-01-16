const hre = require("hardhat");
const constants = require("../../test/constants");

async function main() {
  const { ethers, upgrades, deployments } = hre;

  const WETH =
    hre.network.name === "mainnet"
      ? "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" // mainnet weth
      : "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6"; // goerli weth
  const args = [
    "Spice Peer2Peer",            // name
    "SPP",                        // symbol
    WETH,                         // asset
    [],                           // marketplaces
    constants.accounts.Dev,       // creator
    constants.accounts.Dev,       // dev
    constants.accounts.Multisig,  // multisig
    constants.accounts.Multisig,  // fee recipient
  ];

  const Vault = await ethers.getContractFactory("Vault");
  const beacon = await upgrades.deployBeacon(Vault);
  await beacon.deployed();

  await deployments.save("Vault", beacon);

  const vault = await upgrades.deployBeaconProxy(beacon, Vault, args);

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
