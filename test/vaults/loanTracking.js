const { expect } = require("chai");
const { ethers } = require("hardhat");
const { impersonateAccount, setBalance } = require("../helpers/account");
const BeaconABI = require("../abi/beacon.json");

describe("Loan Tracking", function () {
  const adminAddr = "0xC5a05570Da594f8edCc9BEaA2385c69411c28CBe";
  const beaconAddr = "0x9064abc2c24e9f8340E273Cb28Ca5401E4E5b677";
  const vaultAddr = "0xB88C6BCf936f8bb2413b2852F4a1Fb59A6986939";

  let admin;
  let beacon;
  let vault;

  before("Upgrade to new Vault", async function () {
    await setBalance(
      adminAddr,
      ethers.utils.parseEther("1000").toHexString()
    );
    await impersonateAccount(adminAddr);
    admin = await ethers.getSigner(adminAddr);

    const Vault = await ethers.getContractFactory("Vault");
    const vaultImpl = await Vault.deploy();
    await vaultImpl.deployed();
    console.log("Vault implementation deployed to: ", vaultImpl.address);

    beacon = await ethers.getContractAt(BeaconABI, beaconAddr, admin);
    console.log("Beacon contract loaded");

    await beacon.upgradeTo(vaultImpl.address);
    console.log("Vault beacon upgraded");

    vault = await ethers.getContractAt("Vault", vaultAddr);
    console.log("Vault contract loaded");
  });
});
