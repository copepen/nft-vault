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

    it("Should set the right implementation version", async function () {
      expect(await vault.IMPLEMENTATION_VERSION()).to.equal("1.0");
    });
  });

  describe("User Actions", function () {
    describe("Deposit", function () {
      it("When deposits 0 assets", async function () {
        await expect(
          vault.connect(alice).deposit(0, alice.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When asset is not approved", async function () {
        const assets = ethers.utils.parseEther("100");

        await expect(
          vault.connect(alice).deposit(assets, alice.address)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When balance is not enough", async function () {
        const assets = await token.balanceOf(alice.address);
        await token.connect(alice).approve(vault.address, assets.add(1));

        await expect(
          vault.connect(alice).deposit(assets.add(1), alice.address)
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      });

      it("Take assets and mint shares", async function () {
        const assets = ethers.utils.parseEther("100");
        const shares = await vault.convertToShares(assets);

        await token.connect(alice).approve(vault.address, assets);

        const beforeAssetBalance = await token.balanceOf(alice.address);
        const beforeShareBalance = await vault.balanceOf(bob.address);

        const tx = await vault.connect(alice).deposit(assets, bob.address);

        expect(await vault.balanceOf(bob.address)).to.be.eq(
          beforeShareBalance.add(shares)
        );
        expect(await token.balanceOf(alice.address)).to.be.eq(
          beforeAssetBalance.sub(assets)
        );

        await expect(tx)
          .to.emit(vault, "Deposit")
          .withArgs(alice.address, bob.address, assets, shares);
        await expect(tx)
          .to.emit(vault, "Transfer")
          .withArgs(ethers.constants.AddressZero, bob.address, shares);
        await expect(tx)
          .to.emit(token, "Transfer")
          .withArgs(alice.address, vault.address, assets);
      });

      it("Multi users deposit", async function () {
        const users = [alice, bob, carol];
        const amounts = [
          ethers.utils.parseEther("100"),
          ethers.utils.parseEther("200"),
          ethers.utils.parseEther("500"),
        ];

        // approve
        for (let i = 0; i < users.length; i++) {
          await token.connect(users[i]).approve(vault.address, amounts[i]);
        }

        // deposit
        for (i = 0; i < users.length; i++) {
          const user = users[i];
          const assets = amounts[i];
          const shares = await vault.convertToShares(assets);

          const beforeAssetBalance = await token.balanceOf(user.address);
          const beforeShareBalance = await vault.balanceOf(user.address);

          const tx = await vault.connect(user).deposit(assets, user.address);

          expect(await vault.balanceOf(user.address)).to.be.eq(
            beforeShareBalance.add(shares)
          );
          expect(await token.balanceOf(user.address)).to.be.eq(
            beforeAssetBalance.sub(assets)
          );

          await expect(tx)
            .to.emit(vault, "Deposit")
            .withArgs(user.address, user.address, assets, shares);
          await expect(tx)
            .to.emit(vault, "Transfer")
            .withArgs(ethers.constants.AddressZero, user.address, shares);
          await expect(tx)
            .to.emit(token, "Transfer")
            .withArgs(user.address, vault.address, assets);
        }
      });
    });

    describe("Withdraw", function () {});

    describe("Redeem", function () {});
  });

  describe("Admin Actions", function () {});
});
