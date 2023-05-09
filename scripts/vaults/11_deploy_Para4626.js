const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const args = [
    "sPara",
    "spWETH",
    "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee", // para pool
    "0xaA4b6506493582f169C9329AC0Da99fff23c2911", // pWETH
    "0x59B72FdB45B3182c8502cC297167FE4f821f332d",
  ];

  const Para4626 = await ethers.getContractFactory("Para4626");
  const beacon = await upgrades.deployBeacon(Para4626, {timeout: 0});
  await beacon.deployed();
  await deployments.save("Para4626", beacon);

  const vault = await upgrades.deployBeaconProxy(beacon, Para4626, args, {timeout: 0});
  await vault.deployed();

  console.log(`Para4626 deployed to ${vault.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/vaults/Para4626.sol:Para4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
