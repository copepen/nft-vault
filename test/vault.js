const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("./helpers/snapshot");

describe("Vault", function () {
  let vault;
  let token;
  let owner, alice, bob, carol, dave;
  let snapshotId;

  let defaultAdminRole,
    keeperRole,
    liquidatorRole,
    bidderRole,
    whitelistRole,
    marketplaceRole,
    assetReceiverRole;

  async function deployTokenAndAirdrop(users, amount) {
    const Token = await ethers.getContractFactory("TestERC20");
    const token = await Token.deploy("TestToken", "TT");

    for (let i = 0; i < users.length; i++) {
      await token.mint(users[i].address, amount);
    }

    return token;
  }

  async function checkRole(user, role, check) {
    expect(await vault.hasRole(role, user)).to.equal(check);
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

    defaultAdminRole = await vault.DEFAULT_ADMIN_ROLE();
    keeperRole = await vault.KEEPER_ROLE();
    liquidatorRole = await vault.LIQUIDATOR_ROLE();
    bidderRole = await vault.BIDDER_ROLE();
    whitelistRole = await vault.WHITELIST_ROLE();
    marketplaceRole = await vault.MARKETPLACE_ROLE();
    assetReceiverRole = await vault.ASSET_RECEIVER_ROLE();
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
      await checkRole(owner.address, defaultAdminRole, true);
      await checkRole(owner.address, assetReceiverRole, true);
      await checkRole(owner.address, keeperRole, true);
      await checkRole(owner.address, liquidatorRole, true);
      await checkRole(owner.address, whitelistRole, true);
      await checkRole(owner.address, bidderRole, false);
      await checkRole(owner.address, marketplaceRole, false);

      await checkRole(alice.address, defaultAdminRole, false);
      await checkRole(alice.address, assetReceiverRole, false);
      await checkRole(alice.address, keeperRole, false);
      await checkRole(alice.address, liquidatorRole, false);
      await checkRole(alice.address, whitelistRole, false);
      await checkRole(alice.address, bidderRole, false);
      await checkRole(alice.address, marketplaceRole, false);
    });

    it("Should set the right implementation version", async function () {
      expect(await vault.IMPLEMENTATION_VERSION()).to.equal("1.0");
    });
  });

  describe("User Actions", function () {
    describe("Deposit", function () {
      it("When user is not whitelisted", async function () {
        await expect(
          vault
            .connect(alice)
            .deposit(ethers.utils.parseEther("100"), alice.address)
        ).to.be.revertedWithCustomError(vault, "NotWhitelisted");
      });

      describe("When user is whitelisted", function () {
        beforeEach(async function () {
          await vault.connect(owner).grantRole(whitelistRole, alice.address);
          await vault.connect(owner).grantRole(whitelistRole, bob.address);
          await vault.connect(owner).grantRole(whitelistRole, carol.address);
          await vault.connect(owner).grantRole(whitelistRole, dave.address);

          await checkRole(alice.address, whitelistRole, true);
          await checkRole(bob.address, whitelistRole, true);
          await checkRole(carol.address, whitelistRole, true);
          await checkRole(dave.address, whitelistRole, true);
        });

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
          const shares = await vault.previewDeposit(assets);

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

          expect(await vault.totalAssets()).to.be.eq(assets);
        });

        it("When totalAssets is different from shares", async function () {
          const assets = ethers.utils.parseEther("100");
          let shares = await vault.previewDeposit(assets);

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

          expect(await vault.totalAssets()).to.be.eq(assets);
          expect(await vault.totalSupply()).to.be.eq(shares);

          let totalAssets = ethers.utils.parseEther("200");
          await vault.setTotalAssets(totalAssets);
          expect(await vault.totalAssets()).to.be.eq(totalAssets);

          shares = await vault.previewDeposit(assets);
          expect(shares).to.be.eq((await vault.totalSupply()).mul(assets).div(totalAssets));
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

          let totalAssets = ethers.constants.Zero;

          // deposit
          for (i = 0; i < users.length; i++) {
            const user = users[i];
            const assets = amounts[i];
            totalAssets = totalAssets.add(assets);
            const shares = await vault.previewDeposit(assets);

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

          expect(await vault.totalAssets()).to.be.eq(totalAssets);
        });
      });
    });

    describe("Mint", function () {
      it("When user is not whitelisted", async function () {
        await checkRole(alice.address, whitelistRole, false);
        await expect(
          vault
            .connect(alice)
            .mint(ethers.utils.parseEther("100"), alice.address)
        ).to.be.revertedWithCustomError(vault, "NotWhitelisted");
      });

      describe("When user is whitelisted", function () {
        beforeEach(async function () {
          await vault.connect(owner).grantRole(whitelistRole, alice.address);
          await vault.connect(owner).grantRole(whitelistRole, bob.address);
          await vault.connect(owner).grantRole(whitelistRole, carol.address);
          await vault.connect(owner).grantRole(whitelistRole, dave.address);

          await checkRole(alice.address, whitelistRole, true);
          await checkRole(bob.address, whitelistRole, true);
          await checkRole(carol.address, whitelistRole, true);
          await checkRole(dave.address, whitelistRole, true);
        });

        it("When mints 0 shares", async function () {
          await expect(
            vault.connect(alice).mint(0, alice.address)
          ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
        });

        it("When asset is not approved", async function () {
          const assets = ethers.utils.parseEther("100");

          await expect(
            vault.connect(alice).mint(assets, alice.address)
          ).to.be.revertedWith("ERC20: insufficient allowance");
        });

        it("When balance is not enough", async function () {
          const assets = await token.balanceOf(alice.address);
          await token.connect(alice).approve(vault.address, assets.add(1));

          await expect(
            vault.connect(alice).mint(assets.add(1), alice.address)
          ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        it("Take assets and mint shares", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await vault.previewMint(shares);

          await token.connect(alice).approve(vault.address, assets);

          const beforeAssetBalance = await token.balanceOf(alice.address);
          const beforeShareBalance = await vault.balanceOf(bob.address);

          const tx = await vault.connect(alice).mint(shares, bob.address);

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

          expect(await vault.totalAssets()).to.be.eq(assets);
        });

        it("When totalAssets is different from shares", async function () {
          const shares = ethers.utils.parseEther("100");
          let assets = await vault.previewMint(shares);

          await token.connect(alice).approve(vault.address, assets);

          const beforeAssetBalance = await token.balanceOf(alice.address);
          const beforeShareBalance = await vault.balanceOf(bob.address);

          await vault.connect(alice).mint(shares, bob.address);

          expect(await vault.balanceOf(bob.address)).to.be.eq(
            beforeShareBalance.add(shares)
          );
          expect(await token.balanceOf(alice.address)).to.be.eq(
            beforeAssetBalance.sub(assets)
          );

          expect(await vault.totalAssets()).to.be.eq(assets);
          expect(await vault.totalSupply()).to.be.eq(shares);

          let totalAssets = ethers.utils.parseEther("200");
          await vault.setTotalAssets(totalAssets);
          expect(await vault.totalAssets()).to.be.eq(totalAssets);

          assets = await vault.previewMint(shares);
          expect(assets).to.be.eq((totalAssets).mul(shares).div(await vault.totalSupply()));
        });

        it("Multi users mint", async function () {
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

          let totalAssets = ethers.constants.Zero;

          // deposit
          for (i = 0; i < users.length; i++) {
            const user = users[i];
            const shares = amounts[i];
            const assets = await vault.previewMint(shares);
            totalAssets = totalAssets.add(assets);

            const beforeAssetBalance = await token.balanceOf(user.address);
            const beforeShareBalance = await vault.balanceOf(user.address);

            const tx = await vault.connect(user).mint(assets, user.address);

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

          expect(await vault.totalAssets()).to.be.eq(totalAssets);
        });
      });
    });

    describe("Withdraw", function () {});

    describe("Redeem", function () {});
  });

  describe("Admin Actions", function () {});
});
