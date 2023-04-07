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

  it("Should return collateral address and id for X2Y2", async function () {
    const loan = await vault.getLoan("0x0E258c84Df0f8728ae4A6426EA5FD163Eb6b9D1B", 14695);
    expect(loan.collateralToken).to.be.not.eq(ethers.constants.AddressZero);
    expect(loan.collateralTokenId).to.be.gt(0);
  });

  it("Should return loan info for Arcade", async function () {
    await vault.noteTokenReceived("0x349A026A43FFA8e2Ab4c4e59FCAa93F87Bd8DdeE", 1511);
    const loan = await vault.getLoan("0x349A026A43FFA8e2Ab4c4e59FCAa93F87Bd8DdeE", 1511);
    console.log("Loan:", loan);
  });
});
