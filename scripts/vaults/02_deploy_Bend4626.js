const hre = require("hardhat");

async function main() {
  const { ethers, upgrades } = hre;

  const args = [
    "sBend",
    "sbendWETH",
    "0x70b97A0da65C15dfb0FFA02aEE6FA36e507C2762",
    hre.network.name === "mainnet"
      ? "0xed1840223484483c0cb050e6fc344d1ebf0778a9"
      : hre.network.name === "goerli"
      ? "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6"
      : "0xf531b8f309be94191af87605cfbf600d71c2cfe0",
  ];

  const Bend4626 = await ethers.getContractFactory("Bend4626");
  const beacon = await upgrades.deployBeacon(Bend4626);
  await beacon.deployed();
  await deployments.save("Bend4626", beacon);

  const vault = await upgrades.deployBeaconProxy(beacon, Bend4626, args);
  await vault.deployed();

  console.log(`Bend4626 deployed to ${vault.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/vaults/Bend4626.sol:Bend4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
