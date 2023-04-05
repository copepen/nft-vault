const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("../helpers/snapshot");
const { impersonateAccount, setBalance } = require("../helpers/account");
const { signTestHashAndSignature, signLoanTerms } = require("../helpers/sign");
const constants = require("../constants");

describe("Vault", function () {
  let vault;
  let lending;
  let lenderNote, borrowerNote;
  let nft;
  let weth;
  let admin,
    alice,
    bob,
    carol,
    dave,
    signer,
    treasury,
    marketplace1,
    marketplace2;
  let snapshotId;
  let dev;

  let defaultAdminRole,
    creatorRole,
    assetReceiverRole,
    liquidatorRole,
    bidderRole,
    whitelistRole,
    marketplaceRole,
    signerRole;

  const vaultName = "Spice Vault Test Token";
  const vaultSymbol = "svTT";
  const INVALID_SIGNATURE1 = "0x0000";
  const INVALID_SIGNATURE2 =
    "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

  async function checkRole(user, role, check) {
    expect(await vault.hasRole(role, user)).to.equal(check);
  }

  before("Deploy", async function () {
    [
      admin,
      alice,
      bob,
      carol,
      dave,
      signer,
      treasury,
      marketplace1,
      marketplace2,
    ] = await ethers.getSigners();

    await impersonateAccount(constants.accounts.Dev);
    await setBalance(
      constants.accounts.Dev,
      ethers.utils.parseEther("1000").toHexString()
    );
    dev = await ethers.getSigner(constants.accounts.Dev);

    await admin.sendTransaction({
      to: constants.accounts.Dev,
      value: ethers.utils.parseEther("10"),
    });

    weth = await ethers.getContractAt(
      "TestERC20",
      constants.tokens.WETH,
      admin
    );

    [admin, alice, bob, carol, dave].map(async user => {
      const weth = await ethers.getContractAt(
        "IWETH",
        constants.tokens.WETH,
        admin
      );
      await weth.connect(user).deposit({ value: ethers.utils.parseEther("500") });
    });

    const Vault = await ethers.getContractFactory("Vault");
    let beacon = await upgrades.deployBeacon(Vault);

    await expect(
      upgrades.deployBeaconProxy(beacon, Vault, [
        vaultName,
        vaultSymbol,
        ethers.constants.AddressZero,
        [marketplace1.address, marketplace2.address],
        admin.address,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(Vault, "InvalidAddress");
    await expect(
      upgrades.deployBeaconProxy(beacon, Vault, [
        vaultName,
        vaultSymbol,
        weth.address,
        [marketplace1.address, ethers.constants.AddressZero],
        admin.address,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(Vault, "InvalidAddress");
    await expect(
      upgrades.deployBeaconProxy(beacon, Vault, [
        vaultName,
        vaultSymbol,
        weth.address,
        [marketplace1.address, marketplace2.address],
        ethers.constants.AddressZero,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(Vault, "InvalidAddress");

    await expect(
      upgrades.deployBeaconProxy(beacon, Vault, [
        vaultName,
        vaultSymbol,
        weth.address,
        [marketplace1.address, marketplace2.address],
        admin.address,
        ethers.constants.AddressZero,
        constants.accounts.Multisig,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(Vault, "InvalidAddress");

    await expect(
      upgrades.deployBeaconProxy(beacon, Vault, [
        vaultName,
        vaultSymbol,
        weth.address,
        [marketplace1.address, marketplace2.address],
        admin.address,
        constants.accounts.Dev,
        ethers.constants.AddressZero,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(Vault, "InvalidAddress");

    await expect(
      upgrades.deployBeaconProxy(beacon, Vault, [
        vaultName,
        vaultSymbol,
        weth.address,
        [marketplace1.address, marketplace2.address],
        admin.address,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        ethers.constants.AddressZero,
      ])
    ).to.be.revertedWithCustomError(Vault, "InvalidAddress");

    vault = await upgrades.deployBeaconProxy(beacon, Vault, [
      vaultName,
      vaultSymbol,
      weth.address,
      [marketplace1.address, marketplace2.address],
      admin.address,
      constants.accounts.Dev,
      constants.accounts.Multisig,
      treasury.address,
    ]);

    defaultAdminRole = await vault.DEFAULT_ADMIN_ROLE();
    creatorRole = await vault.CREATOR_ROLE();
    assetReceiverRole = await vault.ASSET_RECEIVER_ROLE();
    liquidatorRole = await vault.LIQUIDATOR_ROLE();
    bidderRole = await vault.BIDDER_ROLE();
    whitelistRole = await vault.WHITELIST_ROLE();
    marketplaceRole = await vault.MARKETPLACE_ROLE();

    await vault.connect(dev).grantRole(defaultAdminRole, admin.address);
    await vault.connect(dev).setWithdrawalFees(700);

    const Note = await ethers.getContractFactory("Note");

    lenderNote = await Note.deploy("Spice Lender Note", "Spice Lender Note");
    await lenderNote.deployed();

    borrowerNote = await Note.deploy(
      "Spice Borrower Note",
      "Spice Borrower Note"
    );
    await borrowerNote.deployed();

    const SpiceLending = await ethers.getContractFactory("SpiceLending");
    beacon = await upgrades.deployBeacon(SpiceLending);

    lending = await upgrades.deployBeaconProxy(beacon, SpiceLending, [
      signer.address,
      lenderNote.address,
      borrowerNote.address,
      500,
      8000,
      1000,
      6000,
      treasury.address,
    ]);

    await lenderNote.initialize(lending.address, true);
    await borrowerNote.initialize(lending.address, false);

    signerRole = await lending.SIGNER_ROLE();

    const SpiceFiNFT4626 = await ethers.getContractFactory("SpiceFiNFT4626");
    beacon = await upgrades.deployBeacon(SpiceFiNFT4626, {
      unsafeAllow: ["delegatecall"],
    });

    nft = await upgrades.deployBeaconProxy(beacon, SpiceFiNFT4626, [
      "Spice0",
      "s0",
      weth.address,
      ethers.utils.parseEther("0.08"),
      555,
      [],
      admin.address,
      constants.accounts.Dev,
      constants.accounts.Multisig,
      treasury.address,
    ]);

    const SpiceNoteAdapter = await ethers.getContractFactory("SpiceNoteAdapter");
    const adapter = await SpiceNoteAdapter.deploy(lending.address);

    await vault.connect(admin).setNoteAdapter(lenderNote.address, adapter.address);
  });

  beforeEach(async () => {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  describe("Deployment", function () {
    it("Should set the correct name", async function () {
      expect(await vault.name()).to.equal(vaultName);
    });

    it("Should set the correct symbol", async function () {
      expect(await vault.symbol()).to.equal(vaultSymbol);
    });

    it("Should set the correct decimal", async function () {
      expect(await vault.decimals()).to.equal(await weth.decimals());
    });

    it("Should set the correct asset", async function () {
      expect(await vault.asset()).to.equal(weth.address);
    });

    it("Should set the correct role", async function () {
      await checkRole(admin.address, creatorRole, true);
      await checkRole(constants.accounts.Dev, defaultAdminRole, true);
      await checkRole(constants.accounts.Multisig, defaultAdminRole, true);
      await checkRole(constants.accounts.Multisig, assetReceiverRole, true);
      await checkRole(constants.accounts.Dev, liquidatorRole, true);
      await checkRole(constants.accounts.Dev, bidderRole, true);
      await checkRole(marketplace1.address, marketplaceRole, true);
      await checkRole(marketplace2.address, marketplaceRole, true);
    });

    it("Should set the correct implementation version", async function () {
      expect(await vault.IMPLEMENTATION_VERSION()).to.equal("2.0");
    });

    it("Should initialize once", async function () {
      await expect(
        vault.initialize(
          vaultName,
          vaultSymbol,
          weth.address,
          [marketplace1.address, marketplace2.address],
          admin.address,
          constants.accounts.Dev,
          constants.accounts.Multisig,
          treasury.address
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("Getters", function () {
    describe("convertToShares", function () {
      it("Zero assets", async function () {
        expect(await vault.convertToShares(0)).to.be.eq(0);
      });

      it("Non-zero assets when supply is zero", async function () {
        const assets = ethers.utils.parseEther("100");
        expect(await vault.convertToShares(assets)).to.be.eq(assets);
      });

      it("Non-zero assets when supply is non-zero", async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);
        const assets = ethers.utils.parseEther("100");
        await weth.connect(alice).approve(vault.address, assets);
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
        await weth.connect(alice).approve(vault.address, assets);
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
        await weth.connect(alice).approve(vault.address, assets);
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
        await weth.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, bob.address);

        expect(await vault.previewMint(100)).to.be.eq(100);
      });
    });

    describe("previewWithdraw", function () {
      it("Zero assets", async function () {
        expect(await vault.previewWithdraw(0)).to.be.eq(0);
      });

      it("Non-zero assets when supply is zero", async function () {
        expect(await vault.previewWithdraw(9300)).to.be.eq(10000);
      });

      it("Non-zero assets when supply is non-zero", async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);
        const assets = ethers.utils.parseEther("100");
        await weth.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, bob.address);

        expect(await vault.previewWithdraw(9300)).to.be.eq(10000);
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
        await weth.connect(alice).approve(vault.address, assets);
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
        await weth.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, alice.address);

        expect(await vault.maxWithdraw(alice.address)).to.be.eq(
          assets.mul(9300).div(10000)
        );
      });
    });

    describe("maxRedeem", function () {
      it("When balance is zero", async function () {
        expect(await vault.maxRedeem(admin.address)).to.be.eq(0);
      });

      it("When balance is non-zero", async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);
        const assets = ethers.utils.parseEther("100");
        await weth.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, alice.address);

        expect(await vault.maxRedeem(alice.address)).to.be.eq(
          assets.mul(9300).div(10000)
        );
      });
    });
  });

  describe("User Actions", function () {
    describe("Deposit", function () {
      it("When user is not whitelisted", async function () {
        await vault.connect(admin).grantRole(whitelistRole, bob.address);
        await weth.connect(alice).approve(vault.address, ethers.constants.MaxUint256);
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
          ).to.be.revertedWith("SafeERC20: low-level call failed");
        });

        it("When balance is not enough", async function () {
          const assets = await weth.balanceOf(alice.address);
          await weth.connect(alice).approve(vault.address, assets.add(1));

          await expect(
            vault.connect(alice).deposit(assets.add(1), alice.address)
          ).to.be.revertedWith("SafeERC20: low-level call failed");
        });

        it("Take assets and mint shares", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await vault.previewDeposit(assets);

          await weth.connect(alice).approve(vault.address, assets);

          const beforeAssetBalance = await weth.balanceOf(alice.address);
          const beforeShareBalance = await vault.balanceOf(bob.address);

          const tx = await vault.connect(alice).deposit(assets, bob.address);

          expect(await vault.balanceOf(bob.address)).to.be.eq(
            beforeShareBalance.add(shares)
          );
          expect(await weth.balanceOf(alice.address)).to.be.eq(
            beforeAssetBalance.sub(assets)
          );

          await expect(tx)
            .to.emit(vault, "Deposit")
            .withArgs(alice.address, bob.address, assets, shares);
          await expect(tx)
            .to.emit(vault, "Transfer")
            .withArgs(ethers.constants.AddressZero, bob.address, shares);
          await expect(tx)
            .to.emit(weth, "Transfer")
            .withArgs(alice.address, vault.address, assets);

          expect(await vault.totalAssets()).to.be.eq(assets);
        });

        it("Multi users deposit", async function () {
          const users = [alice, bob, carol];
          const amounts = [
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("20"),
            ethers.utils.parseEther("50"),
          ];

          // approve
          for (let i = 0; i < users.length; i++) {
            await weth.connect(users[i]).approve(vault.address, amounts[i]);
          }

          let totalAssets = ethers.constants.Zero;

          // deposit
          for (i = 0; i < users.length; i++) {
            const user = users[i];
            const assets = amounts[i];
            totalAssets = totalAssets.add(assets);
            const shares = await vault.previewDeposit(assets);

            const beforeAssetBalance = await weth.balanceOf(user.address);
            const beforeShareBalance = await vault.balanceOf(user.address);

            const tx = await vault.connect(user).deposit(assets, user.address);

            expect(await vault.balanceOf(user.address)).to.be.eq(
              beforeShareBalance.add(shares)
            );
            expect(await weth.balanceOf(user.address)).to.be.eq(
              beforeAssetBalance.sub(assets)
            );

            await expect(tx)
              .to.emit(vault, "Deposit")
              .withArgs(user.address, user.address, assets, shares);
            await expect(tx)
              .to.emit(vault, "Transfer")
              .withArgs(ethers.constants.AddressZero, user.address, shares);
            await expect(tx)
              .to.emit(weth, "Transfer")
              .withArgs(user.address, vault.address, assets);
          }

          expect(await vault.totalAssets()).to.be.eq(totalAssets);
        });
      });
    });

    describe("Mint", function () {
      it("When user is not whitelisted", async function () {
        await vault.connect(admin).grantRole(whitelistRole, bob.address);
        await weth.connect(alice).approve(vault.address, ethers.constants.MaxUint256);
        await expect(
          vault
            .connect(alice)
            .mint(ethers.utils.parseEther("10"), alice.address)
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
          ).to.be.revertedWith("SafeERC20: low-level call failed");
        });

        it("When balance is not enough", async function () {
          const shares = await weth.balanceOf(alice.address);
          await weth.connect(alice).approve(vault.address, shares.add(1));

          await expect(
            vault.connect(alice).mint(shares.add(1), alice.address)
          ).to.be.revertedWith("SafeERC20: low-level call failed");
        });

        it("Take assets and mint shares", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await vault.previewMint(shares);

          await weth.connect(alice).approve(vault.address, assets);

          const beforeAssetBalance = await weth.balanceOf(alice.address);
          const beforeShareBalance = await vault.balanceOf(bob.address);

          const tx = await vault.connect(alice).mint(shares, bob.address);

          expect(await vault.balanceOf(bob.address)).to.be.eq(
            beforeShareBalance.add(shares)
          );
          expect(await weth.balanceOf(alice.address)).to.be.eq(
            beforeAssetBalance.sub(assets)
          );

          await expect(tx)
            .to.emit(vault, "Deposit")
            .withArgs(alice.address, bob.address, assets, shares);
          await expect(tx)
            .to.emit(vault, "Transfer")
            .withArgs(ethers.constants.AddressZero, bob.address, shares);
          await expect(tx)
            .to.emit(weth, "Transfer")
            .withArgs(alice.address, vault.address, assets);

          expect(await vault.totalAssets()).to.be.eq(assets);
        });

        it("Multi users mint", async function () {
          const users = [alice, bob, carol];
          const amounts = [
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("20"),
            ethers.utils.parseEther("50"),
          ];

          // approve
          for (let i = 0; i < users.length; i++) {
            await weth.connect(users[i]).approve(vault.address, amounts[i]);
          }

          let totalAssets = ethers.constants.Zero;

          // deposit
          for (i = 0; i < users.length; i++) {
            const user = users[i];
            const shares = amounts[i];
            const assets = await vault.previewMint(shares);
            totalAssets = totalAssets.add(assets);

            const beforeAssetBalance = await weth.balanceOf(user.address);
            const beforeShareBalance = await vault.balanceOf(user.address);

            const tx = await vault.connect(user).mint(assets, user.address);

            expect(await vault.balanceOf(user.address)).to.be.eq(
              beforeShareBalance.add(shares)
            );
            expect(await weth.balanceOf(user.address)).to.be.eq(
              beforeAssetBalance.sub(assets)
            );

            await expect(tx)
              .to.emit(vault, "Deposit")
              .withArgs(user.address, user.address, assets, shares);
            await expect(tx)
              .to.emit(vault, "Transfer")
              .withArgs(ethers.constants.AddressZero, user.address, shares);
            await expect(tx)
              .to.emit(weth, "Transfer")
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
        await weth.connect(alice).approve(vault.address, assets);
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

      it("Withdraw assets", async function () {
        const assets = ethers.utils.parseEther("50");
        const shares = await vault.previewWithdraw(assets);
        expect(shares).to.be.eq(assets.mul(10000).div(9300));
        const fees = shares.sub(await vault.convertToShares(assets));

        const beforeFeeBalance1 = await weth.balanceOf(treasury.address);
        const beforeFeeBalance2 = await weth.balanceOf(
          constants.accounts.Multisig
        );
        const beforeAssetBalance = await weth.balanceOf(bob.address);
        const beforeShareBalance = await vault.balanceOf(alice.address);

        await vault.connect(alice).withdraw(assets, bob.address, alice.address);

        const afterFeeBalance1 = await weth.balanceOf(treasury.address);
        const afterFeeBalance2 = await weth.balanceOf(
          constants.accounts.Multisig
        );
        const afterAssetBalance = await weth.balanceOf(bob.address);
        const afterShareBalance = await vault.balanceOf(alice.address);

        expect(afterFeeBalance1).to.be.closeTo(
          beforeFeeBalance1.add(fees.div(2)),
          1
        );
        expect(afterFeeBalance2).to.be.closeTo(
          beforeFeeBalance2.add(fees.div(2)),
          1
        );
        expect(afterAssetBalance).to.be.eq(beforeAssetBalance.add(assets));
        expect(beforeShareBalance).to.be.eq(afterShareBalance.add(shares));
      });
    });

    describe("Redeem", function () {
      beforeEach(async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);

        const assets = ethers.utils.parseEther("100");
        await weth.connect(alice).approve(vault.address, assets);
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

      it("Redeem shares", async function () {
        const shares = ethers.utils.parseEther("50");
        const assets = await vault.previewRedeem(shares);
        expect(assets).to.be.eq(shares.mul(9300).div(10000));
        const fees = (await vault.convertToAssets(shares)).sub(assets);

        const beforeFeeBalance1 = await weth.balanceOf(treasury.address);
        const beforeFeeBalance2 = await weth.balanceOf(
          constants.accounts.Multisig
        );
        const beforeAssetBalance = await weth.balanceOf(bob.address);
        const beforeShareBalance = await vault.balanceOf(alice.address);

        await vault.connect(alice).redeem(shares, bob.address, alice.address);

        const afterFeeBalance1 = await weth.balanceOf(treasury.address);
        const afterFeeBalance2 = await weth.balanceOf(
          constants.accounts.Multisig
        );
        const afterAssetBalance = await weth.balanceOf(bob.address);
        const afterShareBalance = await vault.balanceOf(alice.address);

        expect(afterFeeBalance1).to.be.closeTo(
          beforeFeeBalance1.add(fees.div(2)),
          1
        );
        expect(afterFeeBalance2).to.be.closeTo(
          beforeFeeBalance2.add(fees.div(2)),
          1
        );
        expect(afterAssetBalance).to.be.eq(beforeAssetBalance.add(assets));
        expect(beforeShareBalance).to.be.eq(afterShareBalance.add(shares));
      });
    });

    describe("DepositETH", function () {
      it("When user is not whitelisted", async function () {
        await vault.connect(admin).grantRole(whitelistRole, bob.address);
        await expect(
          vault
            .connect(alice)
            .depositETH(alice.address, { value: ethers.utils.parseEther("100") })
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
            vault.connect(alice).depositETH(alice.address, { value: assets })
          ).to.be.revertedWith("Pausable: paused");
        });

        it("When deposits 0 assets", async function () {
          await expect(
            vault.connect(alice).depositETH(alice.address, { value: 0 })
          ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
        });

        it("Take assets and mint shares", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await vault.previewDeposit(assets);

          await weth.connect(alice).approve(vault.address, assets);

          const beforeAssetBalance = await ethers.provider.getBalance(alice.address);
          const beforeShareBalance = await vault.balanceOf(bob.address);

          const tx = await vault.connect(alice).depositETH(bob.address, { value: assets });

          expect(await vault.balanceOf(bob.address)).to.be.eq(
            beforeShareBalance.add(shares)
          );
          expect(await ethers.provider.getBalance(alice.address)).to.be.closeTo(
            beforeAssetBalance.sub(assets),
            ethers.utils.parseEther("0.01")
          );

          await expect(tx)
            .to.emit(vault, "Deposit")
            .withArgs(alice.address, bob.address, assets, shares);
          await expect(tx)
            .to.emit(vault, "Transfer")
            .withArgs(ethers.constants.AddressZero, bob.address, shares);

          expect(await vault.totalAssets()).to.be.eq(assets);
        });

        it("Multi users deposit", async function () {
          const users = [alice, bob, carol];
          const amounts = [
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("20"),
            ethers.utils.parseEther("50"),
          ];

          let totalAssets = ethers.constants.Zero;

          // deposit
          for (i = 0; i < users.length; i++) {
            const user = users[i];
            const assets = amounts[i];
            totalAssets = totalAssets.add(assets);
            const shares = await vault.previewDeposit(assets);

            const beforeAssetBalance = await ethers.provider.getBalance(user.address);
            const beforeShareBalance = await vault.balanceOf(user.address);

            const tx = await vault.connect(user).depositETH(user.address, { value: assets });

            expect(await vault.balanceOf(user.address)).to.be.eq(
              beforeShareBalance.add(shares)
            );
            expect(await ethers.provider.getBalance(user.address)).to.be.closeTo(
              beforeAssetBalance.sub(assets),
              ethers.utils.parseEther("0.01")
            );

            await expect(tx)
              .to.emit(vault, "Deposit")
              .withArgs(user.address, user.address, assets, shares);
            await expect(tx)
              .to.emit(vault, "Transfer")
              .withArgs(ethers.constants.AddressZero, user.address, shares);
          }

          expect(await vault.totalAssets()).to.be.eq(totalAssets);
        });
      });
    });

    describe("MintETH", function () {
      it("When user is not whitelisted", async function () {
        await vault.connect(admin).grantRole(whitelistRole, bob.address);
        const shares = ethers.utils.parseEther("100");
        await expect(
          vault
            .connect(alice)
            .mintETH(shares, alice.address, { value: shares })
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
            vault.connect(alice).mintETH(shares, alice.address, { value: shares })
          ).to.be.revertedWith("Pausable: paused");
        });

        it("When mints 0 shares", async function () {
          await expect(
            vault.connect(alice).mintETH(0, alice.address, { value: 0 })
          ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
        });

        it("Take assets and mint shares", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await vault.previewMint(shares);

          await weth.connect(alice).approve(vault.address, assets);

          const beforeAssetBalance = await ethers.provider.getBalance(alice.address);
          const beforeShareBalance = await vault.balanceOf(bob.address);

          const tx = await vault.connect(alice).mintETH(shares, bob.address, { value: shares });

          expect(await vault.balanceOf(bob.address)).to.be.eq(
            beforeShareBalance.add(shares)
          );
          expect(await ethers.provider.getBalance(alice.address)).to.be.closeTo(
            beforeAssetBalance.sub(assets),
            ethers.utils.parseEther("0.01")
          );

          await expect(tx)
            .to.emit(vault, "Deposit")
            .withArgs(alice.address, bob.address, assets, shares);
          await expect(tx)
            .to.emit(vault, "Transfer")
            .withArgs(ethers.constants.AddressZero, bob.address, shares);

          expect(await vault.totalAssets()).to.be.eq(assets);
        });

        it("Multi users mint", async function () {
          const users = [alice, bob, carol];
          const amounts = [
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("20"),
            ethers.utils.parseEther("50"),
          ];

          let totalAssets = ethers.constants.Zero;

          // deposit
          for (i = 0; i < users.length; i++) {
            const user = users[i];
            const shares = amounts[i];
            const assets = await vault.previewMint(shares);
            totalAssets = totalAssets.add(assets);

            const beforeAssetBalance = await ethers.provider.getBalance(user.address);
            const beforeShareBalance = await vault.balanceOf(user.address);

            const tx = await vault.connect(user).mintETH(assets, user.address, { value: assets });

            expect(await vault.balanceOf(user.address)).to.be.eq(
              beforeShareBalance.add(shares)
            );
            expect(await ethers.provider.getBalance(user.address)).to.be.closeTo(
              beforeAssetBalance.sub(assets),
              ethers.utils.parseEther("0.01")
            );

            await expect(tx)
              .to.emit(vault, "Deposit")
              .withArgs(user.address, user.address, assets, shares);
            await expect(tx)
              .to.emit(vault, "Transfer")
              .withArgs(ethers.constants.AddressZero, user.address, shares);
          }

          expect(await vault.totalAssets()).to.be.eq(totalAssets);
        });
      });
    });

    describe("WithdrawETH", function () {
      beforeEach(async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);

        const assets = ethers.utils.parseEther("100");
        await vault.connect(alice).depositETH(alice.address, { value: assets });
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
            .withdrawETH(0, ethers.constants.AddressZero, alice.address)
        ).to.be.revertedWithCustomError(vault, "InvalidAddress");
      });

      it("When withdraw 0 amount", async function () {
        await expect(
          vault.connect(alice).withdrawETH(0, bob.address, alice.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When allowance is not enough", async function () {
        const assets = ethers.utils.parseEther("50");

        await expect(
          vault.connect(bob).withdrawETH(assets, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When share balance is not enough", async function () {
        const assets = ethers.utils.parseEther("100");

        await expect(
          vault.connect(alice).withdrawETH(assets, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: burn amount exceeds balance");
      });

      it("Withdraw assets", async function () {
        const assets = ethers.utils.parseEther("50");
        const shares = await vault.previewWithdraw(assets);
        expect(shares).to.be.eq(assets.mul(10000).div(9300));
        const fees = shares.sub(await vault.convertToShares(assets));

        const beforeFeeBalance1 = await weth.balanceOf(treasury.address);
        const beforeFeeBalance2 = await weth.balanceOf(
          constants.accounts.Multisig
        );
        const beforeAssetBalance = await ethers.provider.getBalance(bob.address);
        const beforeShareBalance = await vault.balanceOf(alice.address);

        await vault.connect(alice).withdrawETH(assets, bob.address, alice.address);

        const afterFeeBalance1 = await weth.balanceOf(treasury.address);
        const afterFeeBalance2 = await weth.balanceOf(
          constants.accounts.Multisig
        );
        const afterAssetBalance = await ethers.provider.getBalance(bob.address);
        const afterShareBalance = await vault.balanceOf(alice.address);

        expect(afterFeeBalance1).to.be.closeTo(
          beforeFeeBalance1.add(fees.div(2)),
          1
        );
        expect(afterFeeBalance2).to.be.closeTo(
          beforeFeeBalance2.add(fees.div(2)),
          1
        );
        expect(afterAssetBalance).to.be.closeTo(beforeAssetBalance.add(assets), ethers.utils.parseEther("0.01"));
        expect(beforeShareBalance).to.be.eq(afterShareBalance.add(shares));
      });
    });

    describe("RedeemETH", function () {
      beforeEach(async function () {
        await vault.connect(admin).grantRole(whitelistRole, alice.address);

        const assets = ethers.utils.parseEther("100");
        await vault.connect(alice).depositETH(alice.address, { value: assets });
      });

      it("When paused", async function () {
        await vault.connect(admin).pause();
        expect(await vault.paused()).to.be.eq(true);

        const assets = ethers.utils.parseEther("100");

        await expect(
          vault.connect(alice).redeemETH(assets, alice.address, alice.address)
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
          vault.connect(alice).redeemETH(0, bob.address, alice.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When allowance is not enough", async function () {
        const shares = ethers.utils.parseEther("50");

        await expect(
          vault.connect(bob).redeemETH(shares, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When share balance is not enough", async function () {
        const shares = ethers.utils.parseEther("101");

        await expect(
          vault.connect(alice).redeemETH(shares, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: burn amount exceeds balance");
      });

      it("Redeem shares", async function () {
        const shares = ethers.utils.parseEther("50");
        const assets = await vault.previewRedeem(shares);
        expect(assets).to.be.eq(shares.mul(9300).div(10000));
        const fees = (await vault.convertToAssets(shares)).sub(assets);

        const beforeFeeBalance1 = await weth.balanceOf(treasury.address);
        const beforeFeeBalance2 = await weth.balanceOf(
          constants.accounts.Multisig
        );
        const beforeAssetBalance = await ethers.provider.getBalance(bob.address);
        const beforeShareBalance = await vault.balanceOf(alice.address);

        await vault.connect(alice).redeemETH(shares, bob.address, alice.address);

        const afterFeeBalance1 = await weth.balanceOf(treasury.address);
        const afterFeeBalance2 = await weth.balanceOf(
          constants.accounts.Multisig
        );
        const afterAssetBalance = await ethers.provider.getBalance(bob.address);
        const afterShareBalance = await vault.balanceOf(alice.address);

        expect(afterFeeBalance1).to.be.closeTo(
          beforeFeeBalance1.add(fees.div(2)),
          1
        );
        expect(afterFeeBalance2).to.be.closeTo(
          beforeFeeBalance2.add(fees.div(2)),
          1
        );
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
        vault.connect(admin).setWithdrawalFees(10001)
      ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");

      const tx = await vault.connect(admin).setWithdrawalFees(1000);

      await expect(tx)
        .to.emit(vault, "WithdrawalFeeRateUpdated")
        .withArgs(1000);
    });

    it("Set Fee Recipient", async function () {
      await expect(
        vault.connect(alice).setFeeRecipient(dave.address)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        vault.connect(admin).setFeeRecipient(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(vault, "InvalidAddress");

      const tx = await vault.connect(admin).setFeeRecipient(dave.address);

      await expect(tx)
        .to.emit(vault, "FeeRecipientUpdated")
        .withArgs(dave.address);
      expect(await vault.feeRecipient()).to.be.eq(dave.address);
    });

    it("Set Dev", async function () {
      await expect(
        vault.connect(alice).setDev(dave.address)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        vault.connect(admin).setDev(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(vault, "InvalidAddress");

      const tx = await vault.connect(admin).setDev(dave.address);

      await expect(tx).to.emit(vault, "DevUpdated").withArgs(dave.address);
      expect(await vault.dev()).to.be.eq(dave.address);

      await checkRole(constants.accounts.Dev, defaultAdminRole, false);
      await checkRole(constants.accounts.Dev, liquidatorRole, false);
      await checkRole(constants.accounts.Dev, bidderRole, false);
      await checkRole(dave.address, defaultAdminRole, true);
      await checkRole(dave.address, liquidatorRole, true);
      await checkRole(dave.address, bidderRole, true);
    });

    it("Set Multisig", async function () {
      await expect(
        vault.connect(alice).setMultisig(dave.address)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        vault.connect(admin).setMultisig(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(vault, "InvalidAddress");

      const tx = await vault.connect(admin).setMultisig(dave.address);

      await expect(tx).to.emit(vault, "MultisigUpdated").withArgs(dave.address);
      expect(await vault.multisig()).to.be.eq(dave.address);

      await checkRole(constants.accounts.Multisig, defaultAdminRole, false);
      await checkRole(constants.accounts.Multisig, assetReceiverRole, false);
      await checkRole(dave.address, defaultAdminRole, true);
      await checkRole(dave.address, assetReceiverRole, true);
    });

    it("Set total assets", async function () {
      const totalAssets = ethers.utils.parseEther("1000");
      await expect(
        vault.connect(alice).setTotalAssets(totalAssets)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      const tx = await vault.connect(dev).setTotalAssets(totalAssets);

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

    describe("Approve Asset", function () {
      it("When msg.sender does not have enough role", async function () {
        await expect(vault.connect(alice).approveAsset(marketplace1.address, 0))
          .to.be.reverted;
      });

      it("When spender do not have marketplace role", async function () {
        await expect(
          vault.connect(admin).approveAsset(alice.address, 0)
        ).to.be.revertedWith(
          `AccessControl: account ${alice.address.toLowerCase()} is missing role ${marketplaceRole}`
        );
      });

      it("Admin approves asset", async function () {
        const amount = ethers.utils.parseEther("100");
        await vault.connect(admin).approveAsset(marketplace1.address, amount);

        const allowance = await weth.allowance(
          vault.address,
          marketplace1.address
        );
        expect(allowance).to.be.eq(amount);
      });

      it("Bidder approves asset", async function () {
        const amount = ethers.utils.parseEther("100");
        await vault.connect(dev).approveAsset(marketplace1.address, amount);

        const allowance = await weth.allowance(
          vault.address,
          marketplace1.address
        );
        expect(allowance).to.be.eq(amount);
      });
    });
  });

  describe("ERC-1271", function () {
    it("When signature is invalid #1", async function () {
      const hash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes("random string")
      );
      const magicValue = await vault.isValidSignature(hash, INVALID_SIGNATURE1);
      expect(magicValue).to.be.eq("0xffffffff");
    });

    it("When signature is invalid #2", async function () {
      const hash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes("random string")
      );
      const magicValue = await vault.isValidSignature(hash, INVALID_SIGNATURE2);
      expect(magicValue).to.be.eq("0xffffffff");
    });

    it("When signature is invalid #3", async function () {
      const [hash, signature] = await signTestHashAndSignature(alice);
      const magicValue = await vault.isValidSignature(hash, signature);
      expect(magicValue).to.be.eq("0xffffffff");
    });

    it("When signature is valid", async function () {
      const [hash, signature] = await signTestHashAndSignature(admin);
      const magicValue = await vault.isValidSignature(hash, signature);
      expect(magicValue).to.be.eq("0x1626ba7e");
    });
  });

  it("Vault as a lender", async function () {
    const assets = ethers.utils.parseEther("100");
    await weth.connect(alice).approve(vault.address, assets);
    await vault.connect(alice).deposit(assets, alice.address);

    await vault.connect(admin).grantRole(marketplaceRole, lending.address);
    await vault
      .connect(admin)
      .approveAsset(lending.address, ethers.constants.MaxUint256);

    await weth.connect(alice).approve(nft.address, ethers.constants.MaxUint256);
    const amount = ethers.utils.parseEther("50");
    await nft.connect(alice)["deposit(uint256,uint256)"](0, amount.add(ethers.utils.parseEther("0.08")));
    await nft.connect(alice).setApprovalForAll(lending.address, true);

    const terms = {
      lender: vault.address,
      loanAmount: ethers.utils.parseEther("1"),
      interestRate: 550,
      duration: 12 * 24 * 3600, // 12 days
      collateralAddress: nft.address,
      collateralId: 1,
      borrower: alice.address,
      expiration: Math.floor(Date.now() / 1000) + 5 * 60,
      currency: weth.address,
      priceLiquidation: false,
    };
    const signature = await signLoanTerms(bob, lending.address, terms);
    await lending.connect(admin).grantRole(signerRole, bob.address);
    await vault.connect(admin).grantRole(defaultAdminRole, bob.address);
    const loanId = await lending
      .connect(alice)
      .callStatic.initiateLoan(terms, signature);
    await lending
      .connect(alice)
      .initiateLoan(terms, signature);

    const pendingLoans = await vault.getPendingLoans(lenderNote.address);
    expect(pendingLoans.length).to.be.eq(1);
    expect(pendingLoans[0]).to.be.eq(loanId);
    const loan = await vault.getLoan(lenderNote.address, loanId);
    expect(loan.status).to.be.eq(1);
    expect(loan.maturity).to.be.lt(terms.expiration + terms.duration);
    expect(loan.duration).to.be.eq(terms.duration);
    expect(loan.collateralToken).to.be.eq(terms.collateralAddress);
    expect(loan.collateralTokenId).to.be.eq(terms.collateralId);
    expect(loan.principal).to.be.eq(terms.loanAmount);
    expect(loan.repayment).to.be.gt(terms.loanAmount);
  });
});
