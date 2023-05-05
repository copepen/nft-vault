const hre = require("hardhat");
const constants = require("../../test/constants");

async function main() {
  const { ethers, upgrades } = hre;

  const args = [
    "sBlur",
    "sbWETH",
    constants.accounts.BlurBidder, // blur bidder
  ];

  const Blur4626 = await ethers.getContractFactory("Blur4626");
  const beacon = await upgrades.deployBeacon(Blur4626, {timeout: 0});
  await beacon.deployed();
  await deployments.save("Blur4626", beacon);

  const vault = await upgrades.deployBeaconProxy(beacon, Blur4626, args, {timeout: 0});
  await vault.deployed();

  console.log(`Blur4626 deployed to ${vault.address}`);

  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: vault.address,
        contract: "contracts/vaults/Blur4626.sol:Blur4626",
        constructorArguments: [],
      });
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
