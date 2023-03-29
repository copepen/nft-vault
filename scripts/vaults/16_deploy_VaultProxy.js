const hre = require("hardhat");
const constants = require("../../test/constants");

async function main() {
  const { ethers, upgrades, deployments } = hre;

  const Vault = await ethers.getContractFactory("Vault");
  const beacon = await upgrades.deployBeacon(Vault);
  await beacon.deployed();

  await deployments.save("VaultBeacon", beacon);

  console.log(`Vault Beacon deployed to ${beacon.address}`);

  const spiceFactory = await deployments.get("SpiceFiFactory");
  const VaultFactory = await hre.ethers.getContractFactory("VaultFactory");
  const args = [
    beacon.address,
    spiceFactory.address,
    constants.accounts.Dev,
    constants.accounts.Multisig,
    constants.accounts.Multisig,
  ];
  const factory = await VaultFactory.deploy(...args);

  await factory.deployed();

  await deployments.save("VaultFactory", factory);

  console.log(`VaultFactory deployed to ${factory.address}`);

  const WETH =
    hre.network.name === "mainnet"
      ? "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
      : "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6";
  const vault = await factory.callStatic.createVault(WETH, []);
  await factory.createVault(WETH, []);

  console.log(`Vault deployed to ${vault}`);

  const implAddr = await beacon.implementation();

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: implAddr,
        contract: "contracts/vaults/Vault.sol:Vault",
        constructorArguments: [],
      });
    } catch (_) {}

    try {
      await hre.run("verify:verify", {
        address: factory.address,
        contract: "contracts/vaults/VaultFactory.sol:VaultFactory",
        constructorArguments: args,
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
