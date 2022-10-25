const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("./helpers/snapshot");

describe("Vault", function () {
  let vault;
  let token;
  let owner, alice, bob, carol, dave;
  let snapshotId;

  async function deployTokenAndAirdrop(users, amount) {
    const Token = await ethers.getContractFactory("TestERC20");
    const token = await Token.deploy("TestToken", "TT");

    for (let i = 0; i < users.length; i++) {
      await token.mint(users[i].address, amount);
    }

    return token;
  }

  before("Deploy", async function () {
    [owner, alice, bob, carol, dave] = await ethers.getSigners();

    const amount = ethers.utils.parseEther("1000000");
    token = await deployTokenAndAirdrop(
      [owner, alice, bob, carol, dave],
      amount
    );

    const Vault = await ethers.getContractFactory("Vault");

    await expect(
      upgrades.deployProxy(Vault, [
        "Spice Vault Test Token",
        "svTT",
        ethers.constants.AddressZero,
      ])
    ).to.be.revertedWithCustomError(Vault, "InvalidAddress");

    vault = await upgrades.deployProxy(Vault, [
      "Spice Vault Test Token",
      "svTT",
      token.address,
    ]);
  });

  beforeEach(async () => {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  describe("Deployment", function () {
    it("Should set the right name", async function () {
      expect(await vault.name()).to.equal("Spice Vault Test Token");
    });

    it("Should set the right symbol", async function () {
      expect(await vault.symbol()).to.equal("svTT");
    });

    it("Should set the right decimal", async function () {
      expect(await vault.decimals()).to.equal(await token.decimals());
    });

    it("Should set the right asset", async function () {
      expect(await vault.asset()).to.equal(token.address);
    });

    it("Should set the right role", async function () {
      const defaultAdminRole = await vault.DEFAULT_ADMIN_ROLE();
      const emergencyAdminRole = await vault.EMERGENCY_ADMIN_ROLE();

      expect(await vault.hasRole(defaultAdminRole, owner.address)).to.equal(
        true
      );
      expect(await vault.hasRole(emergencyAdminRole, owner.address)).to.equal(
        true
      );

      expect(await vault.hasRole(defaultAdminRole, alice.address)).to.equal(
        false
      );
      expect(await vault.hasRole(emergencyAdminRole, alice.address)).to.equal(
        false
      );
    });
  });

  describe("User Actions", function () {
    describe("Deposit", function () {});

    describe("Withdraw", function () {});

    describe("Redeem", function () {});
  });

  describe("Admin Actions", function () {});
});
