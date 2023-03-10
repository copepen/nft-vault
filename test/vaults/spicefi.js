const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("../helpers/snapshot");
const { impersonateAccount } = require("../helpers/account");
const constants = require("../constants");

describe("SpiceFi4626", function () {
  // tokens
  let token;
  let weth;

  // vaults
  let vault;
  let bend;
  let drops;
  let spiceVault;

  // accounts
  let admin, alice, bob, carol, strategist, spiceAdmin, treasury;
  let whale, dev;

  // snapshot ID
  let snapshotId;

  // roles
  let defaultAdminRole,
    strategistRole,
    vaultRole,
    assetReceiverRole,
    userRole,
    spiceRole,
    creatorRole;

  // constants
  const vaultName = "Spice Vault Test Token";
  const vaultSymbol = "svTT";
  const bendVaultName = "Spice interest bearing WETH";
  const bendVaultSymbol = "spiceETH";
  const dropsVaultName = "Spice CEther";
  const dropsVaultSymbol = "SCEther";
  const spiceVaultName = "Spice0";
  const spiceVaultSymbol = "s0";

  async function deployTokenAndAirdrop(users, amount) {
    const Token = await ethers.getContractFactory("TestERC20");
    const token = await Token.deploy("TestToken", "TT");

    for (let i = 0; i < users.length; i++) {
      await token.mint(users[i].address, amount);
    }

    return token;
  }

  async function checkRole(contract, user, role, check) {
    expect(await contract.hasRole(role, user)).to.equal(check);
  }

  async function depositToVaults(vaults, amounts) {
    for (let i = 0; i < vaults.length; i++) {
      await spiceVault
        .connect(strategist)
        ["deposit(address,uint256,uint256)"](vaults[i], amounts[i], 0);
    }
  }

  before("Deploy", async function () {
    [admin, alice, bob, carol, strategist, spiceAdmin, treasury] =
      await ethers.getSigners();

    await impersonateAccount(constants.accounts.Whale);
    whale = await ethers.getSigner(constants.accounts.Whale);
    await impersonateAccount(constants.accounts.Dev);
    dev = await ethers.getSigner(constants.accounts.Dev);

    const amount = ethers.utils.parseEther("1000000");
    token = await deployTokenAndAirdrop([admin, alice, bob, carol], amount);
    weth = await ethers.getContractAt(
      "TestERC20",
      constants.tokens.WETH,
      admin
    );

    const Vault = await ethers.getContractFactory("Vault");
    let beacon = await upgrades.deployBeacon(Vault);

    vault = await upgrades.deployBeaconProxy(beacon, Vault, [
      vaultName,
      vaultSymbol,
      weth.address,
      [],
      admin.address,
      constants.accounts.Dev,
      constants.accounts.Multisig,
      treasury.address,
    ]);

    const Bend4626 = await ethers.getContractFactory("Bend4626");
    beacon = await upgrades.deployBeacon(Bend4626);

    bend = await upgrades.deployBeaconProxy(beacon, Bend4626, [
      bendVaultName,
      bendVaultSymbol,
      constants.contracts.BendPool,
      constants.tokens.BendWETH,
    ]);

    const Drops4626 = await ethers.getContractFactory("Drops4626");
    beacon = await upgrades.deployBeacon(Drops4626);

    drops = await upgrades.deployBeaconProxy(beacon, Drops4626, [
      dropsVaultName,
      dropsVaultSymbol,
      constants.tokens.DropsETH,
    ]);

    const SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626");
    beacon = await upgrades.deployBeacon(SpiceFi4626, {
      unsafeAllow: ["delegatecall"],
    });

    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceFi4626, [
        spiceVaultName,
        spiceVaultSymbol,
        ethers.constants.AddressZero,
        [vault.address, bend.address, drops.address],
        admin.address,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(SpiceFi4626, "InvalidAddress");
    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceFi4626, [
        spiceVaultName,
        spiceVaultSymbol,
        weth.address,
        [vault.address, bend.address, drops.address],
        ethers.constants.AddressZero,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(SpiceFi4626, "InvalidAddress");
    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceFi4626, [
        spiceVaultName,
        spiceVaultSymbol,
        weth.address,
        [vault.address, bend.address, drops.address],
        admin.address,
        ethers.constants.AddressZero,
        constants.accounts.Multisig,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(SpiceFi4626, "InvalidAddress");
    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceFi4626, [
        spiceVaultName,
        spiceVaultSymbol,
        weth.address,
        [vault.address, bend.address, drops.address],
        admin.address,
        constants.accounts.Dev,
        ethers.constants.AddressZero,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(SpiceFi4626, "InvalidAddress");
    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceFi4626, [
        spiceVaultName,
        spiceVaultSymbol,
        weth.address,
        [vault.address, bend.address, drops.address],
        admin.address,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        ethers.constants.AddressZero,
      ])
    ).to.be.revertedWithCustomError(SpiceFi4626, "InvalidAddress");
    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceFi4626, [
        spiceVaultName,
        spiceVaultSymbol,
        weth.address,
        [vault.address, bend.address, ethers.constants.AddressZero],
        admin.address,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(SpiceFi4626, "InvalidAddress");

    spiceVault = await upgrades.deployBeaconProxy(beacon, SpiceFi4626, [
      spiceVaultName,
      spiceVaultSymbol,
      weth.address,
      [vault.address, bend.address, drops.address],
      admin.address,
      constants.accounts.Dev,
      constants.accounts.Multisig,
      treasury.address,
    ]);

    await spiceVault
      .connect(dev)
      .setMaxTotalSupply(ethers.constants.MaxUint256);

    defaultAdminRole = await spiceVault.DEFAULT_ADMIN_ROLE();
    strategistRole = await spiceVault.STRATEGIST_ROLE();
    vaultRole = await spiceVault.VAULT_ROLE();
    assetReceiverRole = await spiceVault.ASSET_RECEIVER_ROLE();
    userRole = await spiceVault.USER_ROLE();
    spiceRole = await spiceVault.SPICE_ROLE();
    creatorRole = await spiceVault.CREATOR_ROLE();

    await spiceVault.connect(dev).grantRole(strategistRole, strategist.address);
    await spiceVault.connect(dev).grantRole(vaultRole, vault.address);
    await spiceVault.connect(dev).grantRole(vaultRole, bend.address);
    await spiceVault.connect(dev).grantRole(vaultRole, drops.address);
    await checkRole(spiceVault, strategist.address, strategistRole, true);
    await checkRole(spiceVault, vault.address, vaultRole, true);
    await checkRole(spiceVault, bend.address, vaultRole, true);
    await checkRole(spiceVault, drops.address, vaultRole, true);

    await spiceVault.connect(dev).grantRole(spiceRole, spiceAdmin.address);
    await checkRole(spiceVault, spiceAdmin.address, spiceRole, true);

    await spiceVault.connect(dev).grantRole(defaultAdminRole, admin.address);

    await spiceVault.connect(dev).setWithdrawalFees(700);
  });

  beforeEach(async () => {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  describe("Deployment", function () {
    it("Should set the correct name", async function () {
      expect(await spiceVault.name()).to.equal(spiceVaultName);
    });

    it("Should set the correct symbol", async function () {
      expect(await spiceVault.symbol()).to.equal(spiceVaultSymbol);
    });

    it("Should set the correct decimal", async function () {
      expect(await spiceVault.decimals()).to.equal(await weth.decimals());
    });

    it("Should set the correct asset", async function () {
      expect(await spiceVault.asset()).to.equal(weth.address);
    });

    it("Should set the correct role", async function () {
      await checkRole(spiceVault, admin.address, defaultAdminRole, true);
      await checkRole(
        spiceVault,
        constants.accounts.Multisig,
        defaultAdminRole,
        true
      );
      await checkRole(
        spiceVault,
        constants.accounts.Dev,
        defaultAdminRole,
        true
      );
      await checkRole(spiceVault, admin.address, creatorRole, true);
      await checkRole(spiceVault, constants.accounts.Dev, strategistRole, true);
      await checkRole(
        spiceVault,
        constants.accounts.Multisig,
        assetReceiverRole,
        true
      );
      await checkRole(spiceVault, constants.accounts.Dev, userRole, true);
      await checkRole(spiceVault, constants.accounts.Multisig, userRole, true);
      await checkRole(spiceVault, admin.address, userRole, true);
      await checkRole(spiceVault, constants.accounts.Multisig, spiceRole, true);
    });

    it("Should initialize once", async function () {
      await expect(
        spiceVault.initialize(
          spiceVaultName,
          spiceVaultSymbol,
          weth.address,
          [vault.address, bend.address, drops.address],
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
        expect(await spiceVault.convertToShares(0)).to.be.eq(0);
      });

      it("Non-zero assets when supply is zero", async function () {
        const assets = ethers.utils.parseEther("100");
        expect(await spiceVault.convertToShares(assets)).to.be.eq(assets);
      });

      it("Non-zero assets when supply is non-zero", async function () {
        await spiceVault.connect(dev).grantRole(userRole, whale.address);
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, bob.address);

        expect(await spiceVault.convertToShares(100)).to.be.eq(100);
      });
    });

    describe("convertToAssets", function () {
      it("Zero shares", async function () {
        expect(await spiceVault.convertToAssets(0)).to.be.eq(0);
      });

      it("Non-zero shares when supply is zero", async function () {
        expect(await spiceVault.convertToAssets(100)).to.be.eq(100);
      });

      it("Non-zero shares when supply is non-zero", async function () {
        await spiceVault.connect(dev).grantRole(userRole, whale.address);
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, bob.address);

        expect(await spiceVault.convertToAssets(100)).to.be.eq(100);
      });
    });

    describe("previewDeposit", function () {
      it("Zero assets", async function () {
        expect(await spiceVault.previewDeposit(0)).to.be.eq(0);
      });

      it("Non-zero assets when supply is zero", async function () {
        expect(await spiceVault.previewDeposit(100)).to.be.eq(100);
      });

      it("Non-zero assets when supply is non-zero", async function () {
        await spiceVault.connect(dev).grantRole(userRole, whale.address);
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, bob.address);

        expect(await spiceVault.previewDeposit(100)).to.be.eq(100);
      });
    });

    describe("previewMint", function () {
      it("Zero shares", async function () {
        expect(await spiceVault.previewMint(0)).to.be.eq(0);
      });

      it("Non-zero shares when supply is zero", async function () {
        expect(await spiceVault.previewMint(100)).to.be.eq(100);
      });

      it("Non-zero shares when supply is non-zero", async function () {
        await spiceVault.connect(dev).grantRole(userRole, whale.address);
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, bob.address);

        expect(await spiceVault.previewMint(100)).to.be.eq(100);
      });
    });

    describe("previewWithdraw", function () {
      it("Zero assets", async function () {
        expect(await spiceVault.previewWithdraw(0)).to.be.eq(0);
      });

      it("Non-zero assets when supply is zero", async function () {
        expect(await spiceVault.previewWithdraw(9300)).to.be.eq(10000);
      });

      it("Non-zero assets when supply is non-zero", async function () {
        await spiceVault.connect(dev).grantRole(userRole, whale.address);
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, bob.address);

        expect(await spiceVault.previewWithdraw(9300)).to.be.eq(10000);
      });
    });

    describe("previewRedeem", function () {
      it("Zero shares", async function () {
        expect(await spiceVault.previewRedeem(0)).to.be.eq(0);
      });

      it("Non-zero shares when supply is zero", async function () {
        expect(await spiceVault.previewRedeem(10000)).to.be.eq(9300);
      });

      it("Non-zero shares when supply is non-zero", async function () {
        await spiceVault.connect(dev).grantRole(userRole, whale.address);
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, bob.address);

        expect(await spiceVault.previewRedeem(10000)).to.be.eq(9300);
      });
    });

    describe("maxDeposit", function () {
      it("When paused", async function () {
        await spiceVault.pause();
        expect(await spiceVault.maxDeposit(admin.address)).to.be.eq(0);
      });

      it("When totalSupply is zero", async function () {
        expect(await spiceVault.maxDeposit(admin.address)).to.be.eq(
          ethers.constants.MaxUint256
        );
      });

      it("When totalSupply is non-zero", async function () {
        await spiceVault.connect(dev).grantRole(userRole, whale.address);
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, bob.address);

        expect(await spiceVault.maxDeposit(admin.address)).to.be.eq(
          ethers.constants.MaxUint256.sub(assets)
        );
      });
    });

    describe("maxMint", function () {
      it("When paused", async function () {
        await spiceVault.pause();
        expect(await spiceVault.maxMint(admin.address)).to.be.eq(0);
      });

      it("When totalSupply is zero", async function () {
        expect(await spiceVault.maxMint(admin.address)).to.be.eq(
          ethers.constants.MaxUint256
        );
      });

      it("When totalSupply is non-zero", async function () {
        await spiceVault.connect(dev).grantRole(userRole, whale.address);
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, bob.address);

        expect(await spiceVault.maxMint(admin.address)).to.be.eq(
          ethers.constants.MaxUint256.sub(assets)
        );
      });
    });

    describe("maxWithdraw", function () {
      it("When paused", async function () {
        await spiceVault.pause();
        expect(await spiceVault.maxWithdraw(admin.address)).to.be.eq(0);
      });

      it("When balance is zero", async function () {
        expect(await spiceVault.maxWithdraw(admin.address)).to.be.eq(0);
      });

      it("When balance is non-zero", async function () {
        await spiceVault.connect(dev).grantRole(userRole, whale.address);
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, whale.address);

        expect(await spiceVault.maxWithdraw(whale.address)).to.be.eq(
          assets.mul(9300).div(10000)
        );
      });
    });

    describe("maxRedeem", function () {
      it("When paused", async function () {
        await spiceVault.pause();
        expect(await spiceVault.maxRedeem(admin.address)).to.be.eq(0);
      });

      it("When balance is zero", async function () {
        expect(await spiceVault.maxRedeem(admin.address)).to.be.eq(0);
      });

      it("When balance is non-zero", async function () {
        await spiceVault.connect(dev).grantRole(userRole, whale.address);
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, whale.address);

        expect(await spiceVault.maxRedeem(whale.address)).to.be.eq(
          assets.mul(9300).div(10000)
        );
      });
    });
  });

  describe("User Actions", function () {
    describe("Deposit", function () {
      it("When paused", async function () {
        await spiceVault.pause();

        const amount = ethers.utils.parseEther("100");
        await weth
          .connect(whale)
          .approve(spiceVault.address, ethers.constants.MaxUint256);

        await expect(
          spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](amount, alice.address)
        ).to.be.revertedWith("Pausable: paused");
      });

      it("Should not deposit 0 amount", async function () {
        await expect(
          spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](0, alice.address)
        ).to.be.revertedWithCustomError(spiceVault, "ParameterOutOfBounds");
      });

      it("When there are no accounts with USER_ROLE", async function () {
        await spiceVault
          .connect(dev)
          .revokeRole(userRole, constants.accounts.Dev);
        await spiceVault
          .connect(dev)
          .revokeRole(userRole, constants.accounts.Multisig);
        await spiceVault.connect(dev).revokeRole(userRole, admin.address);
        const amount = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, amount);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](amount, whale.address);
      });

      it("When there is account with USER_ROLE", async function () {
        await spiceVault.grantRole(userRole, alice.address);

        const amount = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, amount);
        await expect(
          spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](amount, whale.address)
        ).to.be.revertedWithCustomError(spiceVault, "CallerNotEnabled");

        await spiceVault.grantRole(userRole, whale.address);

        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](amount, whale.address);
      });
    });

    describe("Mint", function () {
      it("When paused", async function () {
        await spiceVault.pause();

        const amount = ethers.utils.parseEther("100");
        await weth
          .connect(whale)
          .approve(spiceVault.address, ethers.constants.MaxUint256);

        await expect(
          spiceVault
            .connect(whale)
            ["mint(uint256,address)"](amount, alice.address)
        ).to.be.revertedWith("Pausable: paused");
      });

      it("Should not deposit 0 amount", async function () {
        await expect(
          spiceVault.connect(whale)["mint(uint256,address)"](0, alice.address)
        ).to.be.revertedWithCustomError(spiceVault, "ParameterOutOfBounds");
      });

      it("When there are no accounts with USER_ROLE", async function () {
        await spiceVault
          .connect(dev)
          .revokeRole(userRole, constants.accounts.Dev);
        await spiceVault
          .connect(dev)
          .revokeRole(userRole, constants.accounts.Multisig);
        await spiceVault.connect(dev).revokeRole(userRole, admin.address);
        const amount = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, amount);
        await spiceVault
          .connect(whale)
          ["mint(uint256,address)"](amount, whale.address);
      });

      it("When there is account with USER_ROLE", async function () {
        await spiceVault.grantRole(userRole, alice.address);

        const amount = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, amount);
        await expect(
          spiceVault
            .connect(whale)
            ["mint(uint256,address)"](amount, whale.address)
        ).to.be.revertedWithCustomError(spiceVault, "CallerNotEnabled");

        await spiceVault.grantRole(userRole, whale.address);

        await spiceVault
          .connect(whale)
          ["mint(uint256,address)"](amount, whale.address);
      });
    });

    describe("Withdraw", function () {
      beforeEach(async function () {
        await spiceVault.connect(dev).grantRole(userRole, whale.address);
        await spiceVault.connect(dev).setWithdrawalFees(700);
        const amount = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, amount);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](amount, whale.address);
      });

      it("When paused", async function () {
        await spiceVault.pause();

        const assets = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(whale)
            ["withdraw(uint256,address,address)"](
              assets,
              alice.address,
              whale.address
            )
        ).to.be.revertedWith("Pausable: paused");
      });

      it("When assets is 0", async function () {
        await expect(
          spiceVault
            .connect(whale)
            ["withdraw(uint256,address,address)"](
              0,
              alice.address,
              whale.address
            )
        ).to.be.revertedWithCustomError(spiceVault, "ParameterOutOfBounds");
      });

      it("When receiver is 0x0", async function () {
        const assets = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(whale)
            ["withdraw(uint256,address,address)"](
              assets,
              ethers.constants.AddressZero,
              whale.address
            )
        ).to.be.revertedWithCustomError(spiceVault, "InvalidAddress");
      });

      it("When caller is not owner", async function () {
        const assets = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(alice)
            ["withdraw(uint256,address,address)"](
              assets,
              alice.address,
              whale.address
            )
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When vault balance is not enough", async function () {
        await depositToVaults(
          [vault.address, bend.address],
          [ethers.utils.parseEther("10"), ethers.utils.parseEther("80")]
        );

        expect(await vault.maxWithdraw(spiceVault.address)).to.be.gt(0);
        const beforeBendDeposit = await bend.maxWithdraw(spiceVault.address);
        expect(beforeBendDeposit).to.be.gt(0);

        const assets = ethers.utils.parseEther("50");
        await spiceVault
          .connect(whale)
          ["withdraw(uint256,address,address)"](
            assets,
            alice.address,
            whale.address
          );

        expect(await vault.maxWithdraw(spiceVault.address)).to.be.eq(0);
        expect(await bend.maxWithdraw(spiceVault.address)).to.be.lt(
          beforeBendDeposit
        );
      });

      it("Split fees properly", async function () {
        const amount = ethers.utils.parseEther("93");
        const beforeBalance1 = await weth.balanceOf(
          constants.accounts.Multisig
        );
        const beforeBalance2 = await weth.balanceOf(treasury.address);
        const beforeBalance3 = await weth.balanceOf(whale.address);
        const fees = amount.mul(700).div(9300);
        const fees1 = fees.div(2);
        const fees2 = fees.sub(fees1);

        await spiceVault
          .connect(whale)
          ["withdraw(uint256,address,address)"](
            amount,
            whale.address,
            whale.address
          );

        expect(await weth.balanceOf(constants.accounts.Multisig)).to.be.eq(
          beforeBalance1.add(fees1)
        );
        expect(await weth.balanceOf(treasury.address)).to.be.eq(
          beforeBalance2.add(fees2)
        );
        expect(await weth.balanceOf(whale.address)).to.be.eq(
          beforeBalance3.add(amount)
        );
      });
    });

    describe("Redeem", function () {
      beforeEach(async function () {
        await spiceVault.connect(dev).grantRole(userRole, whale.address);
        await spiceVault.connect(dev).setWithdrawalFees(700);
        const amount = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, amount);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](amount, whale.address);
      });

      it("When paused", async function () {
        await spiceVault.pause();

        const assets = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(whale)
            ["redeem(uint256,address,address)"](
              assets,
              alice.address,
              whale.address
            )
        ).to.be.revertedWith("Pausable: paused");
      });

      it("When assets is 0", async function () {
        await expect(
          spiceVault
            .connect(whale)
            ["redeem(uint256,address,address)"](0, alice.address, whale.address)
        ).to.be.revertedWithCustomError(spiceVault, "ParameterOutOfBounds");
      });

      it("When receiver is 0x0", async function () {
        const assets = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(whale)
            ["redeem(uint256,address,address)"](
              assets,
              ethers.constants.AddressZero,
              whale.address
            )
        ).to.be.revertedWithCustomError(spiceVault, "InvalidAddress");
      });

      it("When caller is not owner", async function () {
        const assets = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(alice)
            ["redeem(uint256,address,address)"](
              assets,
              alice.address,
              whale.address
            )
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When vault balance is not enough", async function () {
        await depositToVaults(
          [vault.address, bend.address],
          [ethers.utils.parseEther("10"), ethers.utils.parseEther("80")]
        );

        expect(await vault.maxWithdraw(spiceVault.address)).to.be.gt(0);
        const beforeBendDeposit = await bend.maxWithdraw(spiceVault.address);
        expect(beforeBendDeposit).to.be.gt(0);

        const assets = ethers.utils.parseEther("50");
        await spiceVault
          .connect(whale)
          ["redeem(uint256,address,address)"](
            assets,
            alice.address,
            whale.address
          );

        expect(await vault.maxWithdraw(spiceVault.address)).to.be.eq(0);
        expect(await bend.maxWithdraw(spiceVault.address)).to.be.lt(
          beforeBendDeposit
        );
      });

      it("Split fees properly", async function () {
        const shares = ethers.utils.parseEther("100");
        const amount = shares.mul(9300).div(10000);
        const beforeBalance1 = await weth.balanceOf(
          constants.accounts.Multisig
        );
        const beforeBalance2 = await weth.balanceOf(treasury.address);
        const beforeBalance3 = await weth.balanceOf(whale.address);
        const fees = amount.mul(700).div(9300);
        const fees1 = fees.div(2);
        const fees2 = fees.sub(fees1);

        await spiceVault
          .connect(whale)
          ["redeem(uint256,address,address)"](
            shares,
            whale.address,
            whale.address
          );

        expect(await weth.balanceOf(constants.accounts.Multisig)).to.be.eq(
          beforeBalance1.add(fees1)
        );
        expect(await weth.balanceOf(treasury.address)).to.be.eq(
          beforeBalance2.add(fees2)
        );
        expect(await weth.balanceOf(whale.address)).to.be.eq(
          beforeBalance3.add(amount)
        );
      });
    });

    describe("DepositETH", function () {
      it("When paused", async function () {
        await spiceVault.pause();

        const amount = ethers.utils.parseEther("100");
        await expect(
          spiceVault.connect(alice).depositETH(alice.address, { value: amount })
        ).to.be.revertedWith("Pausable: paused");
      });

      it("Should not deposit 0 amount", async function () {
        await expect(
          spiceVault.connect(alice).depositETH(alice.address)
        ).to.be.revertedWithCustomError(spiceVault, "ParameterOutOfBounds");
      });

      it("When there are no accounts with USER_ROLE", async function () {
        await spiceVault
          .connect(dev)
          .revokeRole(userRole, constants.accounts.Dev);
        await spiceVault
          .connect(dev)
          .revokeRole(userRole, constants.accounts.Multisig);
        await spiceVault.connect(dev).revokeRole(userRole, admin.address);
        const amount = ethers.utils.parseEther("100");
        await spiceVault
          .connect(alice)
          .depositETH(alice.address, { value: amount });
      });

      it("When there is account with USER_ROLE", async function () {
        await spiceVault.grantRole(userRole, bob.address);

        const amount = ethers.utils.parseEther("100");
        await expect(
          spiceVault.connect(alice).depositETH(alice.address, { value: amount })
        ).to.be.revertedWithCustomError(spiceVault, "CallerNotEnabled");

        await spiceVault.grantRole(userRole, alice.address);

        await spiceVault
          .connect(alice)
          .depositETH(alice.address, { value: amount });
      });
    });

    describe("MintETH", function () {
      it("When paused", async function () {
        await spiceVault.pause();

        const amount = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(alice)
            .mintETH(amount, alice.address, { value: amount })
        ).to.be.revertedWith("Pausable: paused");
      });

      it("Should not deposit 0 amount", async function () {
        await expect(
          spiceVault.connect(alice).mintETH(0, alice.address)
        ).to.be.revertedWithCustomError(spiceVault, "ParameterOutOfBounds");
      });

      it("Should send enough eth amount", async function () {
        await expect(
          spiceVault.connect(alice).mintETH(1, alice.address, { value: 0 })
        ).to.be.revertedWithCustomError(spiceVault, "ParameterOutOfBounds");
      });

      it("When there are no accounts with USER_ROLE", async function () {
        await spiceVault
          .connect(dev)
          .revokeRole(userRole, constants.accounts.Dev);
        await spiceVault
          .connect(dev)
          .revokeRole(userRole, constants.accounts.Multisig);
        await spiceVault.connect(dev).revokeRole(userRole, admin.address);
        const amount = ethers.utils.parseEther("100");
        await spiceVault
          .connect(alice)
          .mintETH(amount, alice.address, { value: amount });
      });

      it("When there is account with USER_ROLE", async function () {
        await spiceVault.grantRole(userRole, bob.address);

        const amount = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(alice)
            .mintETH(amount, alice.address, { value: amount })
        ).to.be.revertedWithCustomError(spiceVault, "CallerNotEnabled");

        await spiceVault.grantRole(userRole, alice.address);

        await spiceVault
          .connect(alice)
          .mintETH(amount, alice.address, { value: amount });
      });

      it("Deposit and refund", async function () {
        await spiceVault.grantRole(userRole, alice.address);
        const amount = ethers.utils.parseEther("100");
        await spiceVault.connect(alice).mintETH(amount, alice.address, {
          value: amount.add(ethers.utils.parseEther("10")),
        });
      });
    });

    describe("WithdrawETH", function () {
      beforeEach(async function () {
        await spiceVault.connect(dev).grantRole(userRole, alice.address);
        await spiceVault.connect(dev).setWithdrawalFees(700);
        const amount = ethers.utils.parseEther("100");
        await spiceVault
          .connect(alice)
          .depositETH(alice.address, { value: amount });
      });

      it("When paused", async function () {
        await spiceVault.pause();

        const assets = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(alice)
            .withdrawETH(assets, whale.address, alice.address)
        ).to.be.revertedWith("Pausable: paused");
      });

      it("When assets is 0", async function () {
        await expect(
          spiceVault.connect(alice).withdrawETH(0, alice.address, alice.address)
        ).to.be.revertedWithCustomError(spiceVault, "ParameterOutOfBounds");
      });

      it("When receiver is 0x0", async function () {
        const assets = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(alice)
            .withdrawETH(assets, ethers.constants.AddressZero, alice.address)
        ).to.be.revertedWithCustomError(spiceVault, "InvalidAddress");
      });

      it("When caller is not owner", async function () {
        const assets = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(whale)
            .withdrawETH(assets, alice.address, alice.address)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When vault balance is not enough", async function () {
        await depositToVaults(
          [vault.address, bend.address],
          [ethers.utils.parseEther("10"), ethers.utils.parseEther("80")]
        );

        expect(await vault.maxWithdraw(spiceVault.address)).to.be.gt(0);
        const beforeBendDeposit = await bend.maxWithdraw(spiceVault.address);
        expect(beforeBendDeposit).to.be.gt(0);

        const assets = ethers.utils.parseEther("50");
        await spiceVault
          .connect(alice)
          .withdrawETH(assets, alice.address, alice.address);

        expect(await vault.maxWithdraw(spiceVault.address)).to.be.eq(0);
        expect(await bend.maxWithdraw(spiceVault.address)).to.be.lt(
          beforeBendDeposit
        );
      });

      it("Split fees properly", async function () {
        const amount = ethers.utils.parseEther("93");
        const beforeBalance1 = await weth.balanceOf(
          constants.accounts.Multisig
        );
        const beforeBalance2 = await weth.balanceOf(treasury.address);
        const beforeBalance3 = await ethers.provider.getBalance(bob.address);
        const fees = amount.mul(700).div(9300);
        const fees1 = fees.div(2);
        const fees2 = fees.sub(fees1);

        await spiceVault
          .connect(alice)
          .withdrawETH(amount, bob.address, alice.address);

        expect(await weth.balanceOf(constants.accounts.Multisig)).to.be.eq(
          beforeBalance1.add(fees1)
        );
        expect(await weth.balanceOf(treasury.address)).to.be.eq(
          beforeBalance2.add(fees2)
        );
        expect(await ethers.provider.getBalance(bob.address)).to.be.eq(
          beforeBalance3.add(amount)
        );
      });
    });

    describe("RedeemETH", function () {
      beforeEach(async function () {
        await spiceVault.connect(dev).grantRole(userRole, alice.address);
        await spiceVault.connect(dev).setWithdrawalFees(700);
        const amount = ethers.utils.parseEther("100");
        await spiceVault
          .connect(alice)
          .depositETH(alice.address, { value: amount });
      });

      it("When paused", async function () {
        await spiceVault.pause();

        const shares = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(alice)
            .redeemETH(shares, whale.address, alice.address)
        ).to.be.revertedWith("Pausable: paused");
      });

      it("When assets is 0", async function () {
        await expect(
          spiceVault.connect(alice).redeemETH(0, alice.address, alice.address)
        ).to.be.revertedWithCustomError(spiceVault, "ParameterOutOfBounds");
      });

      it("When receiver is 0x0", async function () {
        const assets = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(alice)
            .redeemETH(assets, ethers.constants.AddressZero, alice.address)
        ).to.be.revertedWithCustomError(spiceVault, "InvalidAddress");
      });

      it("When caller is not owner", async function () {
        const shares = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(whale)
            .redeemETH(shares, alice.address, alice.address)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When vault balance is not enough", async function () {
        await depositToVaults(
          [vault.address, bend.address],
          [ethers.utils.parseEther("10"), ethers.utils.parseEther("80")]
        );

        expect(await vault.maxWithdraw(spiceVault.address)).to.be.gt(0);
        const beforeBendDeposit = await bend.maxWithdraw(spiceVault.address);
        expect(beforeBendDeposit).to.be.gt(0);

        const shares = ethers.utils.parseEther("50");
        await spiceVault
          .connect(alice)
          .redeemETH(shares, alice.address, alice.address);

        expect(await vault.maxWithdraw(spiceVault.address)).to.be.eq(0);
        expect(await bend.maxWithdraw(spiceVault.address)).to.be.lt(
          beforeBendDeposit
        );
      });

      it("Split fees properly", async function () {
        const shares = ethers.utils.parseEther("100");
        const amount = ethers.utils.parseEther("93");
        const beforeBalance1 = await weth.balanceOf(
          constants.accounts.Multisig
        );
        const beforeBalance2 = await weth.balanceOf(treasury.address);
        const beforeBalance3 = await ethers.provider.getBalance(bob.address);
        const fees = amount.mul(700).div(9300);
        const fees1 = fees.div(2);
        const fees2 = fees.sub(fees1);

        await spiceVault
          .connect(alice)
          .redeemETH(shares, bob.address, alice.address);

        expect(await weth.balanceOf(constants.accounts.Multisig)).to.be.eq(
          beforeBalance1.add(fees1)
        );
        expect(await weth.balanceOf(treasury.address)).to.be.eq(
          beforeBalance2.add(fees2)
        );
        expect(await ethers.provider.getBalance(bob.address)).to.be.eq(
          beforeBalance3.add(amount)
        );
      });
    });

    describe("Transfer", function () {
      beforeEach(async function () {
        await spiceVault.connect(dev).grantRole(userRole, whale.address);
        const amount = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, amount);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](amount, whale.address);
      });

      it("When paused", async function () {
        await spiceVault.pause();

        const amount = ethers.utils.parseEther("50");
        await expect(
          spiceVault
            .connect(whale)
            ["transfer(address,uint256)"](alice.address, amount)
        ).to.be.revertedWith("ERC20Pausable: token transfer while paused");
      });

      it("Transfer correct amount", async function () {
        const balance = await spiceVault.balanceOf(whale.address);
        const amount = ethers.utils.parseEther("30");
        await spiceVault
          .connect(whale)
          ["transfer(address,uint256)"](alice.address, amount);
        expect(await spiceVault.balanceOf(alice.address)).to.be.eq(amount);
        expect(await spiceVault.balanceOf(whale.address)).to.be.eq(
          balance.sub(amount)
        );
      });
    });
  });

  describe("Strategist Actions", function () {
    describe("Vault", function () {
      describe("Deposit", function () {
        beforeEach(async function () {
          await spiceVault.connect(dev).grantRole(userRole, whale.address);
          const assets = ethers.utils.parseEther("100");
          await weth.connect(whale).approve(spiceVault.address, assets);
          await spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](assets, whale.address);
        });

        it("Only strategist can call", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await vault.previewDeposit(assets);
          await expect(
            spiceVault
              .connect(alice)
              ["deposit(address,uint256,uint256)"](
                vault.address,
                assets,
                shares.mul(99).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
          );
        });

        it("Only deposit to vault", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await vault.previewDeposit(assets);
          await expect(
            spiceVault
              .connect(strategist)
              ["deposit(address,uint256,uint256)"](
                token.address,
                assets,
                shares.mul(99).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
          );
        });

        it("When slippage is too high", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await vault.previewDeposit(assets);
          await expect(
            spiceVault
              .connect(strategist)
              ["deposit(address,uint256,uint256)"](
                vault.address,
                assets,
                shares.mul(101).div(100)
              )
          ).to.be.revertedWithCustomError(spiceVault, "SlippageTooHigh");
        });

        it("Take assets and mint shares", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await vault.previewDeposit(assets);
          await spiceVault
            .connect(strategist)
            ["deposit(address,uint256,uint256)"](
              vault.address,
              assets,
              shares.mul(99).div(100)
            );

          expect(await vault.balanceOf(spiceVault.address)).to.be.eq(assets);
        });
      });

      describe("Mint", function () {
        beforeEach(async function () {
          await spiceVault.connect(dev).grantRole(userRole, whale.address);
          const assets = ethers.utils.parseEther("100");
          await weth.connect(whale).approve(spiceVault.address, assets);
          await spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](assets, whale.address);
        });

        it("Only strategist can call", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await vault.previewMint(shares);
          await expect(
            spiceVault
              .connect(alice)
              ["mint(address,uint256,uint256)"](
                vault.address,
                shares,
                assets.mul(101).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
          );
        });

        it("Only mint to vault", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await vault.previewMint(shares);
          await expect(
            spiceVault
              .connect(strategist)
              ["mint(address,uint256,uint256)"](
                token.address,
                shares,
                assets.mul(101).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
          );
        });

        it("When slippage is too high", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await vault.previewMint(shares);
          await expect(
            spiceVault
              .connect(strategist)
              ["mint(address,uint256,uint256)"](
                vault.address,
                shares,
                assets.mul(99).div(100)
              )
          ).to.be.revertedWithCustomError(spiceVault, "SlippageTooHigh");
        });

        it("Take assets and mint shares", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await vault.previewMint(shares);
          await spiceVault
            .connect(strategist)
            ["mint(address,uint256,uint256)"](
              vault.address,
              shares,
              assets.mul(101).div(100)
            );

          expect(await vault.balanceOf(spiceVault.address)).to.be.eq(shares);
        });
      });

      describe("Withdraw", function () {
        beforeEach(async function () {
          await spiceVault.connect(dev).grantRole(userRole, whale.address);
          const assets = ethers.utils.parseEther("100");
          await weth.connect(whale).approve(spiceVault.address, assets);
          await spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](assets, whale.address);

          await spiceVault
            .connect(strategist)
            ["deposit(address,uint256,uint256)"](vault.address, assets, 0);
        });

        it("Only strategist can call", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await vault.previewWithdraw(assets);
          await expect(
            spiceVault
              .connect(alice)
              ["withdraw(address,uint256,uint256)"](
                vault.address,
                assets,
                shares.mul(101).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
          );
        });

        it("Only withdraw from vault", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await vault.previewWithdraw(assets);
          await expect(
            spiceVault
              .connect(strategist)
              ["withdraw(address,uint256,uint256)"](
                token.address,
                assets,
                shares.mul(101).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
          );
        });

        it("When slippage is too high", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await vault.previewWithdraw(assets);
          await expect(
            spiceVault
              .connect(strategist)
              ["withdraw(address,uint256,uint256)"](
                vault.address,
                assets,
                shares.mul(99).div(100)
              )
          ).to.be.revertedWithCustomError(spiceVault, "SlippageTooHigh");
        });

        it("Withdraw assets", async function () {
          const assets = ethers.utils.parseEther("50");
          const shares = await vault.previewWithdraw(assets);
          await spiceVault
            .connect(strategist)
            ["withdraw(address,uint256,uint256)"](
              vault.address,
              assets,
              shares.mul(101).div(100)
            );
        });
      });

      describe("Redeem", function () {
        beforeEach(async function () {
          await spiceVault.connect(dev).grantRole(userRole, whale.address);
          const assets = ethers.utils.parseEther("100");
          await weth.connect(whale).approve(spiceVault.address, assets);
          await spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](assets, whale.address);

          await spiceVault
            .connect(strategist)
            ["deposit(address,uint256,uint256)"](vault.address, assets, 0);
        });

        it("Only strategist can call", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await vault.previewRedeem(shares);
          await expect(
            spiceVault
              .connect(alice)
              ["redeem(address,uint256,uint256)"](
                vault.address,
                shares,
                assets.mul(99).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
          );
        });

        it("Only redeem from vault", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await vault.previewRedeem(shares);
          await expect(
            spiceVault
              .connect(strategist)
              ["redeem(address,uint256,uint256)"](
                token.address,
                shares,
                assets.mul(99).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
          );
        });

        it("When slippage is too high", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await vault.previewRedeem(shares);
          await expect(
            spiceVault
              .connect(strategist)
              ["redeem(address,uint256,uint256)"](
                vault.address,
                shares,
                assets.mul(101).div(100)
              )
          ).to.be.revertedWithCustomError(spiceVault, "SlippageTooHigh");
        });

        it("Redeem assets", async function () {
          const shares = ethers.utils.parseEther("50");
          const assets = await vault.previewRedeem(shares);
          await spiceVault
            .connect(strategist)
            ["redeem(address,uint256,uint256)"](
              vault.address,
              shares,
              assets.mul(99).div(100)
            );
        });
      });
    });

    describe("Bend", function () {
      describe("Deposit", function () {
        beforeEach(async function () {
          await spiceVault.connect(dev).grantRole(userRole, whale.address);
          const assets = ethers.utils.parseEther("100");
          await weth.connect(whale).approve(spiceVault.address, assets);
          await spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](assets, whale.address);
        });

        it("Only strategist can call", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await bend.previewDeposit(assets);
          await expect(
            spiceVault
              .connect(alice)
              ["deposit(address,uint256,uint256)"](
                bend.address,
                assets,
                shares.mul(99).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
          );
        });

        it("Only deposit to bend", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await bend.previewDeposit(assets);
          await expect(
            spiceVault
              .connect(strategist)
              ["deposit(address,uint256,uint256)"](
                token.address,
                assets,
                shares.mul(99).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
          );
        });

        it("When slippage is too high", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await bend.previewDeposit(assets);
          await expect(
            spiceVault
              .connect(strategist)
              ["deposit(address,uint256,uint256)"](
                bend.address,
                assets,
                shares.mul(101).div(100)
              )
          ).to.be.revertedWithCustomError(spiceVault, "SlippageTooHigh");
        });

        it("Take assets and mint shares", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await bend.previewDeposit(assets);
          await spiceVault
            .connect(strategist)
            ["deposit(address,uint256,uint256)"](
              bend.address,
              assets,
              shares.mul(99).div(100)
            );

          expect(await bend.balanceOf(spiceVault.address)).to.be.eq(assets);
        });
      });

      describe("Mint", function () {
        beforeEach(async function () {
          await spiceVault.connect(dev).grantRole(userRole, whale.address);
          const assets = ethers.utils.parseEther("100");
          await weth.connect(whale).approve(spiceVault.address, assets);
          await spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](assets, whale.address);
        });

        it("Only strategist can call", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await bend.previewMint(shares);
          await expect(
            spiceVault
              .connect(alice)
              ["mint(address,uint256,uint256)"](
                bend.address,
                shares,
                assets.mul(101).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
          );
        });

        it("Only mint to bend", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await bend.previewMint(shares);
          await expect(
            spiceVault
              .connect(strategist)
              ["mint(address,uint256,uint256)"](
                token.address,
                shares,
                assets.mul(101).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
          );
        });

        it("When slippage is too high", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await bend.previewMint(shares);
          await expect(
            spiceVault
              .connect(strategist)
              ["mint(address,uint256,uint256)"](
                bend.address,
                shares,
                assets.mul(99).div(100)
              )
          ).to.be.revertedWithCustomError(spiceVault, "SlippageTooHigh");
        });

        it("Take assets and mint shares", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await bend.previewMint(shares);
          await spiceVault
            .connect(strategist)
            ["mint(address,uint256,uint256)"](
              bend.address,
              shares,
              assets.mul(101).div(100)
            );

          expect(await bend.balanceOf(spiceVault.address)).to.be.eq(shares);
        });
      });

      describe("Withdraw", function () {
        beforeEach(async function () {
          await spiceVault.connect(dev).grantRole(userRole, whale.address);
          const assets = ethers.utils.parseEther("100");
          await weth.connect(whale).approve(spiceVault.address, assets);
          await spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](assets, whale.address);

          await spiceVault
            .connect(strategist)
            ["deposit(address,uint256,uint256)"](bend.address, assets, 0);
        });

        it("Only strategist can call", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await bend.previewWithdraw(assets);
          await expect(
            spiceVault
              .connect(alice)
              ["withdraw(address,uint256,uint256)"](
                bend.address,
                assets,
                shares.mul(101).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
          );
        });

        it("Only withdraw from bend", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await bend.previewWithdraw(assets);
          await expect(
            spiceVault
              .connect(strategist)
              ["withdraw(address,uint256,uint256)"](
                token.address,
                assets,
                shares.mul(101).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
          );
        });

        it("When slippage is too high", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await bend.previewWithdraw(assets);
          await expect(
            spiceVault
              .connect(strategist)
              ["withdraw(address,uint256,uint256)"](
                bend.address,
                assets,
                shares.mul(99).div(100)
              )
          ).to.be.revertedWithCustomError(spiceVault, "SlippageTooHigh");
        });

        it("Withdraw assets", async function () {
          const assets = ethers.utils.parseEther("50");
          const shares = await bend.previewWithdraw(assets);
          await spiceVault
            .connect(strategist)
            ["withdraw(address,uint256,uint256)"](
              bend.address,
              assets,
              shares.mul(101).div(100)
            );
        });
      });

      describe("Redeem", function () {
        beforeEach(async function () {
          await spiceVault.connect(dev).grantRole(userRole, whale.address);
          const assets = ethers.utils.parseEther("100");
          await weth.connect(whale).approve(spiceVault.address, assets);
          await spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](assets, whale.address);

          await spiceVault
            .connect(strategist)
            ["deposit(address,uint256,uint256)"](bend.address, assets, 0);
        });

        it("Only strategist can call", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await bend.previewRedeem(shares);
          await expect(
            spiceVault
              .connect(alice)
              ["redeem(address,uint256,uint256)"](
                bend.address,
                shares,
                assets.mul(99).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
          );
        });

        it("Only redeem from bend", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await bend.previewRedeem(shares);
          await expect(
            spiceVault
              .connect(strategist)
              ["redeem(address,uint256,uint256)"](
                token.address,
                shares,
                assets.mul(99).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
          );
        });

        it("When slippage is too high", async function () {
          const shares = ethers.utils.parseEther("100");
          const assets = await bend.previewRedeem(shares);
          await expect(
            spiceVault
              .connect(strategist)
              ["redeem(address,uint256,uint256)"](
                bend.address,
                shares,
                assets.mul(101).div(100)
              )
          ).to.be.revertedWithCustomError(spiceVault, "SlippageTooHigh");
        });

        it("Redeem assets", async function () {
          const shares = ethers.utils.parseEther("50");
          const assets = await bend.previewRedeem(shares);
          await spiceVault
            .connect(strategist)
            ["redeem(address,uint256,uint256)"](
              bend.address,
              shares,
              assets.mul(99).div(100)
            );
        });
      });
    });

    describe("Drops", function () {
      describe("Deposit", function () {
        beforeEach(async function () {
          await spiceVault.connect(dev).grantRole(userRole, whale.address);
          const assets = ethers.utils.parseEther("100");
          await weth.connect(whale).approve(spiceVault.address, assets);
          await spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](assets, whale.address);
        });

        it("Only strategist can call", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await drops.previewDeposit(assets);
          await expect(
            spiceVault
              .connect(alice)
              ["deposit(address,uint256,uint256)"](
                drops.address,
                assets,
                shares.mul(99).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
          );
        });

        it("Only deposit to drops", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await drops.previewDeposit(assets);
          await expect(
            spiceVault
              .connect(strategist)
              ["deposit(address,uint256,uint256)"](
                token.address,
                assets,
                shares.mul(99).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
          );
        });

        it("When slippage is too high", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await drops.previewDeposit(assets);
          await expect(
            spiceVault
              .connect(strategist)
              ["deposit(address,uint256,uint256)"](
                drops.address,
                assets,
                shares.mul(101).div(100)
              )
          ).to.be.revertedWithCustomError(spiceVault, "SlippageTooHigh");
        });

        it("Take assets and mint shares", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await drops.previewDeposit(assets);
          await spiceVault
            .connect(strategist)
            ["deposit(address,uint256,uint256)"](
              drops.address,
              assets,
              shares.mul(99).div(100)
            );

          expect(await drops.balanceOf(spiceVault.address)).to.be.closeTo(
            shares,
            shares.div(1000)
          );
        });
      });

      describe("Mint", function () {
        beforeEach(async function () {
          await spiceVault.connect(dev).grantRole(userRole, whale.address);
          const assets = ethers.utils.parseEther("100");
          await weth.connect(whale).approve(spiceVault.address, assets);
          await spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](assets, whale.address);
        });

        it("Only strategist can call", async function () {
          const shares = ethers.utils.parseUnits("1000", 6);
          const assets = await drops.previewMint(shares);
          await expect(
            spiceVault
              .connect(alice)
              ["mint(address,uint256,uint256)"](
                drops.address,
                shares,
                assets.mul(101).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
          );
        });

        it("Only mint to drops", async function () {
          const shares = ethers.utils.parseUnits("1000", 6);
          const assets = await drops.previewMint(shares);
          await expect(
            spiceVault
              .connect(strategist)
              ["mint(address,uint256,uint256)"](
                token.address,
                shares,
                assets.mul(101).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
          );
        });

        it("When slippage is too high", async function () {
          const shares = ethers.utils.parseUnits("1000", 6);
          const assets = await drops.previewMint(shares);
          await expect(
            spiceVault
              .connect(strategist)
              ["mint(address,uint256,uint256)"](
                drops.address,
                shares,
                assets.mul(99).div(100)
              )
          ).to.be.revertedWithCustomError(spiceVault, "SlippageTooHigh");
        });

        it("Take assets and mint shares", async function () {
          const shares = ethers.utils.parseUnits("1000", 6);
          const assets = await drops.previewMint(shares);
          await spiceVault
            .connect(strategist)
            ["mint(address,uint256,uint256)"](
              drops.address,
              shares,
              assets.mul(101).div(100)
            );

          expect(await drops.balanceOf(spiceVault.address)).to.be.closeTo(
            shares,
            shares.div(1000)
          );
        });
      });

      describe("Withdraw", function () {
        beforeEach(async function () {
          await spiceVault.connect(dev).grantRole(userRole, whale.address);
          const assets = ethers.utils.parseEther("100");
          await weth.connect(whale).approve(spiceVault.address, assets);
          await spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](assets, whale.address);

          await spiceVault
            .connect(strategist)
            ["deposit(address,uint256,uint256)"](drops.address, assets, 0);
        });

        it("Only strategist can call", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await drops.previewWithdraw(assets);
          await expect(
            spiceVault
              .connect(alice)
              ["withdraw(address,uint256,uint256)"](
                drops.address,
                assets,
                shares.mul(101).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
          );
        });

        it("Only withdraw from drops", async function () {
          const assets = ethers.utils.parseEther("100");
          const shares = await drops.previewWithdraw(assets);
          await expect(
            spiceVault
              .connect(strategist)
              ["withdraw(address,uint256,uint256)"](
                token.address,
                assets,
                shares.mul(101).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
          );
        });

        it("When slippage is too high", async function () {
          const assets = ethers.utils.parseEther("50");
          const shares = await drops.previewWithdraw(assets);
          await expect(
            spiceVault
              .connect(strategist)
              ["withdraw(address,uint256,uint256)"](
                drops.address,
                assets,
                shares.mul(99).div(100)
              )
          ).to.be.revertedWithCustomError(spiceVault, "SlippageTooHigh");
        });

        it("Withdraw assets", async function () {
          const assets = ethers.utils.parseEther("50");
          const shares = await drops.previewWithdraw(assets);
          await spiceVault
            .connect(strategist)
            ["withdraw(address,uint256,uint256)"](
              drops.address,
              assets,
              shares.mul(101).div(100)
            );
        });
      });

      describe("Redeem", function () {
        beforeEach(async function () {
          await spiceVault.connect(dev).grantRole(userRole, whale.address);
          const assets = ethers.utils.parseEther("100");
          await weth.connect(whale).approve(spiceVault.address, assets);
          await spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](assets, whale.address);

          await spiceVault
            .connect(strategist)
            ["deposit(address,uint256,uint256)"](drops.address, assets, 0);
        });

        it("Only strategist can call", async function () {
          const shares = ethers.utils.parseEther("50");
          const assets = await drops.previewRedeem(shares);
          await expect(
            spiceVault
              .connect(alice)
              ["redeem(address,uint256,uint256)"](
                drops.address,
                shares,
                assets.mul(99).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
          );
        });

        it("Only redeem from drops", async function () {
          const shares = ethers.utils.parseEther("50");
          const assets = await drops.previewRedeem(shares);
          await expect(
            spiceVault
              .connect(strategist)
              ["redeem(address,uint256,uint256)"](
                token.address,
                shares,
                assets.mul(99).div(100)
              )
          ).to.be.revertedWith(
            `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
          );
        });

        it("When slippage is too high", async function () {
          const shares = ethers.utils.parseEther("50");
          const assets = await drops.previewRedeem(shares);
          await expect(
            spiceVault
              .connect(strategist)
              ["redeem(address,uint256,uint256)"](
                drops.address,
                shares,
                assets.mul(101).div(100)
              )
          ).to.be.revertedWithCustomError(spiceVault, "SlippageTooHigh");
        });

        it("Redeem assets", async function () {
          const shares = ethers.utils.parseEther("50");
          const assets = await drops.previewRedeem(shares);
          await spiceVault
            .connect(strategist)
            ["redeem(address,uint256,uint256)"](
              drops.address,
              shares,
              assets.mul(99).div(100)
            );
        });
      });
    });
  });

  describe("Admin Actions", function () {
    it("Set withdrawal fees", async function () {
      await expect(
        spiceVault.connect(alice).setWithdrawalFees(1000)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        spiceVault.connect(admin).setWithdrawalFees(10001)
      ).to.be.revertedWithCustomError(spiceVault, "ParameterOutOfBounds");

      await spiceVault.connect(admin).setWithdrawalFees(1000);

      expect(await spiceVault.withdrawalFees()).to.be.eq(1000);
    });

    it("Set Dev", async function () {
      await expect(
        spiceVault.connect(alice).setDev(carol.address)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        spiceVault.connect(admin).setDev(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(spiceVault, "InvalidAddress");

      const tx = await spiceVault.connect(admin).setDev(carol.address);

      await expect(tx)
        .to.emit(spiceVault, "DevUpdated")
        .withArgs(carol.address);
      expect(await spiceVault.dev()).to.be.eq(carol.address);

      await checkRole(
        spiceVault,
        constants.accounts.Dev,
        defaultAdminRole,
        false
      );
      await checkRole(
        spiceVault,
        constants.accounts.Dev,
        strategistRole,
        false
      );
      await checkRole(spiceVault, constants.accounts.Dev, userRole, false);
      await checkRole(spiceVault, carol.address, defaultAdminRole, true);
      await checkRole(spiceVault, carol.address, strategistRole, true);
      await checkRole(spiceVault, carol.address, userRole, true);
    });

    it("Set Multisig", async function () {
      await expect(
        spiceVault.connect(alice).setMultisig(carol.address)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        spiceVault.connect(admin).setMultisig(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(spiceVault, "InvalidAddress");

      const tx = await spiceVault.connect(admin).setMultisig(carol.address);

      await expect(tx)
        .to.emit(spiceVault, "MultisigUpdated")
        .withArgs(carol.address);
      expect(await spiceVault.multisig()).to.be.eq(carol.address);

      await checkRole(
        spiceVault,
        constants.accounts.Multisig,
        defaultAdminRole,
        false
      );
      await checkRole(
        spiceVault,
        constants.accounts.Multisig,
        assetReceiverRole,
        false
      );
      await checkRole(spiceVault, constants.accounts.Multisig, userRole, false);
      await checkRole(
        spiceVault,
        constants.accounts.Multisig,
        spiceRole,
        false
      );
      await checkRole(spiceVault, carol.address, defaultAdminRole, true);
      await checkRole(spiceVault, carol.address, assetReceiverRole, true);
      await checkRole(spiceVault, carol.address, userRole, true);
      await checkRole(spiceVault, carol.address, spiceRole, true);
    });

    it("Set Fee Recipient", async function () {
      await expect(
        spiceVault.connect(alice).setFeeRecipient(carol.address)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        spiceVault.connect(admin).setFeeRecipient(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(spiceVault, "InvalidAddress");

      const tx = await spiceVault.connect(admin).setFeeRecipient(carol.address);

      await expect(tx)
        .to.emit(spiceVault, "FeeRecipientUpdated")
        .withArgs(carol.address);
      expect(await spiceVault.feeRecipient()).to.be.eq(carol.address);
    });

    it("Set max total supply", async function () {
      const totalSupply = ethers.utils.parseUnits("1000000", 18);
      await expect(
        spiceVault.connect(alice).setMaxTotalSupply(totalSupply)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await spiceVault.connect(admin).setMaxTotalSupply(totalSupply);

      expect(await spiceVault.maxTotalSupply()).to.be.eq(totalSupply);
    });

    it("Set verified", async function () {
      expect(await spiceVault.verified()).to.be.eq(false);

      await expect(
        spiceVault.connect(alice).setVerified(true)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${spiceRole}`
      );

      await spiceVault.connect(spiceAdmin).setVerified(true);

      expect(await spiceVault.verified()).to.be.eq(true);
    });

    it("Pause", async function () {
      await expect(spiceVault.connect(alice).pause()).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      expect(await spiceVault.paused()).to.be.eq(false);

      const tx = await spiceVault.connect(admin).pause();

      await expect(tx).to.emit(spiceVault, "Paused").withArgs(admin.address);

      expect(await spiceVault.paused()).to.be.eq(true);
    });

    it("Unpause", async function () {
      await spiceVault.connect(admin).pause();

      await expect(spiceVault.connect(alice).unpause()).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      expect(await spiceVault.paused()).to.be.eq(true);

      const tx = await spiceVault.connect(admin).unpause();

      await expect(tx).to.emit(spiceVault, "Unpaused").withArgs(admin.address);

      expect(await spiceVault.paused()).to.be.eq(false);
    });
  });
});
