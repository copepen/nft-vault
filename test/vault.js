const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("./helpers/snapshot");
require("./helpers/units");

describe("Vault", function () {
  let vault;
  let token;
  let nft;
  let admin, alice, bob, carol, dave;
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

  async function deployNFT() {
    const TestERC721 = await ethers.getContractFactory("TestERC721");
    const nft = await TestERC721.deploy("TestNFT", "NFT", "baseuri");

    return nft;
  }

  async function checkRole(user, role, check) {
    expect(await vault.hasRole(role, user)).to.equal(check);
  }

  before("Deploy", async function () {
    [admin, alice, bob, carol, dave] = await ethers.getSigners();

    const amount = ethers.utils.parseEther("1000000");
    token = await deployTokenAndAirdrop(
      [admin, alice, bob, carol, dave],
      amount
    );

    nft = await deployNFT();

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
    it("Should set the correct name", async function () {
      expect(await vault.name()).to.equal("Spice Vault Test Token");
    });

    it("Should set the correct symbol", async function () {
      expect(await vault.symbol()).to.equal("svTT");
    });

    it("Should set the correct decimal", async function () {
      expect(await vault.decimals()).to.equal(await token.decimals());
    });

    it("Should set the correct asset", async function () {
      expect(await vault.asset()).to.equal(token.address);
    });

    it("Should set the correct role", async function () {
      await checkRole(admin.address, defaultAdminRole, true);
      await checkRole(admin.address, assetReceiverRole, true);
      await checkRole(admin.address, keeperRole, true);
      await checkRole(admin.address, liquidatorRole, true);
      await checkRole(admin.address, whitelistRole, true);
      await checkRole(admin.address, bidderRole, false);
      await checkRole(admin.address, marketplaceRole, false);

      await checkRole(alice.address, defaultAdminRole, false);
      await checkRole(alice.address, assetReceiverRole, false);
      await checkRole(alice.address, keeperRole, false);
      await checkRole(alice.address, liquidatorRole, false);
      await checkRole(alice.address, whitelistRole, false);
      await checkRole(alice.address, bidderRole, false);
      await checkRole(alice.address, marketplaceRole, false);
    });

    it("Should set the correct implementation version", async function () {
      expect(await vault.IMPLEMENTATION_VERSION()).to.equal("1.0");
    });

    it("Should initialize once", async function () {
      await expect(
        vault.initialize("Spice Vault Test Token", "svTT", token.address)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should be upgraded only by default admin", async function () {
      let Vault = await ethers.getContractFactory("Vault", alice);

      await expect(
        upgrades.upgradeProxy(vault.address, Vault)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      Vault = await ethers.getContractFactory("Vault", admin);

      await upgrades.upgradeProxy(vault.address, Vault);
    });
  });

  describe("Getters", function () {
    describe("convertToShares", function () {
      it("Zero assets", async function () {
        expect(await vault.convertToShares(0)).to.be.eq(0);
      });

      it("Non-zero assets when supply is zero", async function () {
        expect(await vault.convertToShares(100)).to.be.eq(100);
      });

      it("Non-zero assets when supply is non-zero", async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);
        const assets = ethers.utils.parseEther("100");
        await token.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, bob.address);

        expect(await vault.convertToShares(100)).to.be.eq(100);
      });
    });

    describe("convertToAssets", function () {
      it("Zero shares", async function () {
        expect(await vault.convertToAssets(0)).to.be.eq(0);
      });

      it("Non-zero shares when supply is zero", async function () {
        expect(await vault.convertToAssets(100)).to.be.eq(100);
      });

      it("Non-zero shares when supply is non-zero", async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);
        const assets = ethers.utils.parseEther("100");
        await token.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, bob.address);

        expect(await vault.convertToAssets(100)).to.be.eq(100);
      });
    });

    describe("previewDeposit", function () {
      it("Zero assets", async function () {
        expect(await vault.previewDeposit(0)).to.be.eq(0);
      });

      it("Non-zero assets when supply is zero", async function () {
        expect(await vault.previewDeposit(100)).to.be.eq(100);
      });

      it("Non-zero assets when supply is non-zero", async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);
        const assets = ethers.utils.parseEther("100");
        await token.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, bob.address);

        expect(await vault.previewDeposit(100)).to.be.eq(100);
      });
    });

    describe("previewMint", function () {
      it("Zero shares", async function () {
        expect(await vault.previewMint(0)).to.be.eq(0);
      });

      it("Non-zero shares when supply is zero", async function () {
        expect(await vault.previewMint(100)).to.be.eq(100);
      });

      it("Non-zero shares when supply is non-zero", async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);
        const assets = ethers.utils.parseEther("100");
        await token.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, bob.address);

        expect(await vault.previewMint(100)).to.be.eq(100);
      });
    });

    describe("previewWithdraw", function () {
      it("Zero assets", async function () {
        expect(await vault.previewWithdraw(0)).to.be.eq(0);
      });

      it("Non-zero assets when supply is zero", async function () {
        expect(await vault.previewWithdraw(10000)).to.be.eq(10700);
      });

      it("Non-zero assets when supply is non-zero", async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);
        const assets = ethers.utils.parseEther("100");
        await token.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, bob.address);

        expect(await vault.previewWithdraw(10000)).to.be.eq(10700);
      });
    });

    describe("previewRedeem", function () {
      it("Zero shares", async function () {
        expect(await vault.previewRedeem(0)).to.be.eq(0);
      });

      it("Non-zero shares when supply is zero", async function () {
        expect(await vault.previewRedeem(10000)).to.be.eq(9300);
      });

      it("Non-zero shares when supply is non-zero", async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);
        const assets = ethers.utils.parseEther("100");
        await token.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, bob.address);

        expect(await vault.previewRedeem(10000)).to.be.eq(9300);
      });
    });

    it("maxDeposit", async function () {
      expect(await vault.maxDeposit(admin.address)).to.be.eq(
        ethers.constants.MaxUint256
      );
    });

    it("maxMint", async function () {
      expect(await vault.maxMint(admin.address)).to.be.eq(
        ethers.constants.MaxUint256
      );
    });

    describe("maxWithdraw", function () {
      it("When balance is zero", async function () {
        expect(await vault.maxWithdraw(admin.address)).to.be.eq(0);
      });

      it("When balance is non-zero", async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);
        const assets = ethers.utils.parseEther("100");
        await token.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, alice.address);

        expect(await vault.maxWithdraw(alice.address)).to.be.eq(assets);
      });
    });

    describe("maxRedeem", function () {
      it("When balance is zero", async function () {
        expect(await vault.maxRedeem(admin.address)).to.be.eq(0);
      });

      it("When balance is non-zero", async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);
        const assets = ethers.utils.parseEther("100");
        await token.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, alice.address);

        expect(await vault.maxRedeem(alice.address)).to.be.eq(assets);
      });
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
          await vault.connect(admin).grantRole(whitelistRole, alice.address);
          await vault.connect(admin).grantRole(whitelistRole, bob.address);
          await vault.connect(admin).grantRole(whitelistRole, carol.address);
          await vault.connect(admin).grantRole(whitelistRole, dave.address);

          await checkRole(alice.address, whitelistRole, true);
          await checkRole(bob.address, whitelistRole, true);
          await checkRole(carol.address, whitelistRole, true);
          await checkRole(dave.address, whitelistRole, true);
        });

        it("When paused", async function () {
          await vault.connect(admin).pause();
          expect(await vault.paused()).to.be.eq(true);

          const assets = ethers.utils.parseEther("100");

          await expect(
            vault.connect(alice).deposit(assets, alice.address)
          ).to.be.revertedWith("Pausable: paused");
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
          expect(shares).to.be.eq(
            (await vault.totalSupply()).mul(assets).div(totalAssets)
          );
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
          await vault.connect(admin).grantRole(whitelistRole, alice.address);
          await vault.connect(admin).grantRole(whitelistRole, bob.address);
          await vault.connect(admin).grantRole(whitelistRole, carol.address);
          await vault.connect(admin).grantRole(whitelistRole, dave.address);

          await checkRole(alice.address, whitelistRole, true);
          await checkRole(bob.address, whitelistRole, true);
          await checkRole(carol.address, whitelistRole, true);
          await checkRole(dave.address, whitelistRole, true);
        });

        it("When paused", async function () {
          await vault.connect(admin).pause();
          expect(await vault.paused()).to.be.eq(true);

          const shares = ethers.utils.parseEther("100");

          await expect(
            vault.connect(alice).mint(shares, alice.address)
          ).to.be.revertedWith("Pausable: paused");
        });

        it("When mints 0 shares", async function () {
          await expect(
            vault.connect(alice).mint(0, alice.address)
          ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
        });

        it("When asset is not approved", async function () {
          const shares = ethers.utils.parseEther("100");

          await expect(
            vault.connect(alice).mint(shares, alice.address)
          ).to.be.revertedWith("ERC20: insufficient allowance");
        });

        it("When balance is not enough", async function () {
          const shares = await token.balanceOf(alice.address);
          await token.connect(alice).approve(vault.address, shares.add(1));

          await expect(
            vault.connect(alice).mint(shares.add(1), alice.address)
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
          expect(assets).to.be.eq(
            totalAssets.mul(shares).div(await vault.totalSupply())
          );
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

    describe("Withdraw", function () {
      beforeEach(async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);

        const assets = ethers.utils.parseEther("100");
        await token.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, alice.address);
      });

      it("When paused", async function () {
        await vault.connect(admin).pause();
        expect(await vault.paused()).to.be.eq(true);

        const assets = ethers.utils.parseEther("100");

        await expect(
          vault.connect(alice).withdraw(assets, alice.address, alice.address)
        ).to.be.revertedWith("Pausable: paused");
      });

      it("When receiver is 0x0", async function () {
        await expect(
          vault
            .connect(alice)
            .withdraw(0, ethers.constants.AddressZero, alice.address)
        ).to.be.revertedWithCustomError(vault, "InvalidAddress");
      });

      it("When withdraw 0 amount", async function () {
        await expect(
          vault.connect(alice).withdraw(0, bob.address, alice.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When allowance is not enough", async function () {
        const assets = ethers.utils.parseEther("50");

        await expect(
          vault.connect(bob).withdraw(assets, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When share balance is not enough", async function () {
        const assets = ethers.utils.parseEther("100");

        await expect(
          vault.connect(alice).withdraw(assets, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: burn amount exceeds balance");
      });

      it("When asset balance is not enough", async function () {
        const assets = ethers.utils.parseEther("200");

        await vault
          .connect(admin)
          .setTotalAssets(ethers.utils.parseEther("200"));

        await expect(
          vault.connect(alice).withdraw(assets, bob.address, alice.address)
        ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
      });

      it("Withdraw assets", async function () {
        const assets = ethers.utils.parseEther("50");
        const shares = await vault.previewWithdraw(assets);
        expect(shares).to.be.eq(assets.mul(10700).div(10000));
        const fees = shares.sub(await vault.convertToShares(assets));

        const beforeFeeBalance = await token.balanceOf(admin.address);
        const beforeAssetBalance = await token.balanceOf(bob.address);
        const beforeShareBalance = await vault.balanceOf(alice.address);

        await vault.connect(alice).withdraw(assets, bob.address, alice.address);

        const afterFeeBalance = await token.balanceOf(admin.address);
        const afterAssetBalance = await token.balanceOf(bob.address);
        const afterShareBalance = await vault.balanceOf(alice.address);

        expect(afterFeeBalance).to.be.eq(beforeFeeBalance.add(fees));
        expect(afterAssetBalance).to.be.eq(beforeAssetBalance.add(assets));
        expect(beforeShareBalance).to.be.eq(afterShareBalance.add(shares));
      });
    });

    describe("Redeem", function () {
      beforeEach(async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);

        const assets = ethers.utils.parseEther("100");
        await token.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, alice.address);
      });

      it("When paused", async function () {
        await vault.connect(admin).pause();
        expect(await vault.paused()).to.be.eq(true);

        const assets = ethers.utils.parseEther("100");

        await expect(
          vault.connect(alice).redeem(assets, alice.address, alice.address)
        ).to.be.revertedWith("Pausable: paused");
      });

      it("When receiver is 0x0", async function () {
        await expect(
          vault
            .connect(alice)
            .redeem(0, ethers.constants.AddressZero, alice.address)
        ).to.be.revertedWithCustomError(vault, "InvalidAddress");
      });

      it("When redeem 0 amount", async function () {
        await expect(
          vault.connect(alice).redeem(0, bob.address, alice.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When allowance is not enough", async function () {
        const shares = ethers.utils.parseEther("50");

        await expect(
          vault.connect(bob).redeem(shares, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When share balance is not enough", async function () {
        const shares = ethers.utils.parseEther("101");

        await expect(
          vault.connect(alice).redeem(shares, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: burn amount exceeds balance");
      });

      it("When shares balance is not enough", async function () {
        const shares = ethers.utils.parseEther("100");

        await vault
          .connect(admin)
          .setTotalAssets(ethers.utils.parseEther("200"));

        await expect(
          vault.connect(alice).redeem(shares, bob.address, alice.address)
        ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
      });

      it("Redeem shares", async function () {
        const shares = ethers.utils.parseEther("50");
        const assets = await vault.previewRedeem(shares);
        expect(assets).to.be.eq(shares.mul(9300).div(10000));
        const fees = (await vault.convertToAssets(shares)).sub(assets);

        const beforeFeeBalance = await token.balanceOf(admin.address);
        const beforeAssetBalance = await token.balanceOf(bob.address);
        const beforeShareBalance = await vault.balanceOf(alice.address);

        await vault.connect(alice).redeem(shares, bob.address, alice.address);

        const afterFeeBalance = await token.balanceOf(admin.address);
        const afterAssetBalance = await token.balanceOf(bob.address);
        const afterShareBalance = await vault.balanceOf(alice.address);

        expect(afterFeeBalance).to.be.eq(beforeFeeBalance.add(fees));
        expect(afterAssetBalance).to.be.eq(beforeAssetBalance.add(assets));
        expect(beforeShareBalance).to.be.eq(afterShareBalance.add(shares));
      });
    });
  });

  describe("Admin Actions", function () {
    it("Set withdrawal fees", async function () {
      await expect(
        vault.connect(alice).setWithdrawalFees(1000)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        vault.connect(admin).setWithdrawalFees(0)
      ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      await expect(
        vault.connect(admin).setWithdrawalFees(10000)
      ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");

      const tx = await vault.connect(admin).setWithdrawalFees(1000);

      await expect(tx)
        .to.emit(vault, "WithdrawalFeeRateUpdated")
        .withArgs(1000);
    });

    it("Set total assets", async function () {
      const totalAssets = ethers.utils.parseEther("1000");
      await expect(
        vault.connect(alice).setTotalAssets(totalAssets)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${keeperRole}`
      );

      const tx = await vault.connect(admin).setTotalAssets(totalAssets);

      await expect(tx).to.emit(vault, "TotalAssets").withArgs(totalAssets);

      expect(await vault.totalAssets()).to.be.eq(totalAssets);
    });

    it("Pause", async function () {
      await expect(vault.connect(alice).pause()).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      expect(await vault.paused()).to.be.eq(false);

      const tx = await vault.connect(admin).pause();

      await expect(tx).to.emit(vault, "Paused").withArgs(admin.address);

      expect(await vault.paused()).to.be.eq(true);
    });

    it("Unpause", async function () {
      await vault.connect(admin).pause();

      await expect(vault.connect(alice).unpause()).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      expect(await vault.paused()).to.be.eq(true);

      const tx = await vault.connect(admin).unpause();

      await expect(tx).to.emit(vault, "Unpaused").withArgs(admin.address);

      expect(await vault.paused()).to.be.eq(false);
    });

    it("Approve asset", async function () {
      const spender = dave.address;
      const amount = ethers.utils.parseEther("1000");

      expect(await token.allowance(vault.address, spender)).to.be.eq(0);

      await expect(
        vault.connect(alice).approveAsset(spender, amount)
      ).to.be.revertedWithoutReason();

      await vault.connect(admin).grantRole(bidderRole, alice.address);

      await expect(
        vault.connect(alice).approveAsset(spender, amount)
      ).to.be.revertedWith(
        `AccessControl: account ${spender.toLowerCase()} is missing role ${marketplaceRole}`
      );

      await vault.connect(admin).grantRole(marketplaceRole, spender);
      await vault
        .connect(admin)
        .grantRole(marketplaceRole, ethers.constants.AddressZero);

      await expect(
        vault.connect(alice).approveAsset(ethers.constants.AddressZero, amount)
      ).to.be.revertedWith("ERC20: approve to the zero address");

      const tx = await vault.connect(alice).approveAsset(spender, amount);

      await expect(tx)
        .to.emit(token, "Approval")
        .withArgs(vault.address, spender, amount);

      expect(await token.allowance(vault.address, spender)).to.be.eq(amount);

      await vault.connect(admin).approveAsset(spender, amount);
    });

    it("Transfer NFT out of Vault", async function () {
      await nft.mint(alice.address, 1);
      await nft.mint(vault.address, 2);

      await expect(
        vault.connect(alice).transferNFT(nft.address, 1)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${liquidatorRole}`
      );

      await expect(
        vault.connect(admin).transferNFT(nft.address, 1)
      ).to.be.revertedWithoutReason();

      await expect(
        vault.connect(admin).transferNFT(token.address, 1)
      ).to.be.revertedWithoutReason();

      await vault.connect(admin).transferNFT(nft.address, 2);

      expect(await nft.ownerOf(2)).to.be.eq(admin.address);
    });
  });
});
