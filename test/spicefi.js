const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("./helpers/snapshot");
const { impersonateAccount } = require("./helpers/account");
const constants = require("./constants");

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
  let admin,
    alice,
    bob,
    carol,
    strategist,
    spiceAdmin,
    assetReceiver,
    vaultReceiver;
  let whale;

  // snapshot ID
  let snapshotId;

  // roles
  let defaultAdminRole,
    strategistRole,
    vaultRole,
    vaultReceiverRole,
    assetReceiverRole,
    userRole,
    spiceRole;

  // constants
  const vaultName = "Spice Vault Test Token";
  const vaultSymbol = "svTT";
  const bendVaultName = "Spice interest bearing WETH";
  const bendVaultSymbol = "spiceETH";
  const dropsVaultName = "Spice CEther";
  const dropsVaultSymbol = "SCEther";

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

  before("Deploy", async function () {
    // mainnet fork
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.MAINNET_RPC_URL || "",
          },
        },
      ],
    });

    [
      admin,
      alice,
      bob,
      carol,
      strategist,
      spiceAdmin,
      assetReceiver,
      vaultReceiver,
    ] = await ethers.getSigners();

    whale = await ethers.getSigner(constants.accounts.Whale1);
    await impersonateAccount(constants.accounts.Whale1);

    const amount = ethers.utils.parseEther("1000000");
    token = await deployTokenAndAirdrop([admin, alice, bob, carol], amount);
    weth = await ethers.getContractAt(
      "TestERC20",
      constants.tokens.WETH,
      admin
    );

    const Vault = await ethers.getContractFactory("Vault");

    vault = await upgrades.deployProxy(Vault, [
      vaultName,
      vaultSymbol,
      weth.address,
    ]);

    const Bend4626 = await ethers.getContractFactory("Bend4626");

    bend = await upgrades.deployProxy(Bend4626, [
      bendVaultName,
      bendVaultSymbol,
      constants.contracts.BendPool,
      constants.tokens.BendWETH,
    ]);

    const Drops4626 = await ethers.getContractFactory("Drops4626");

    drops = await upgrades.deployProxy(Drops4626, [
      dropsVaultName,
      dropsVaultSymbol,
      constants.tokens.DropsETH,
    ]);

    const SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626");

    await expect(
      upgrades.deployProxy(SpiceFi4626, [
        ethers.constants.AddressZero,
        strategist.address,
        assetReceiver.address,
        700,
      ])
    ).to.be.revertedWithCustomError(SpiceFi4626, "InvalidAddress");
    await expect(
      upgrades.deployProxy(SpiceFi4626, [
        weth.address,
        ethers.constants.AddressZero,
        assetReceiver.address,
        700,
      ])
    ).to.be.revertedWithCustomError(SpiceFi4626, "InvalidAddress");
    await expect(
      upgrades.deployProxy(SpiceFi4626, [
        weth.address,
        strategist.address,
        ethers.constants.AddressZero,
        700,
      ])
    ).to.be.revertedWithCustomError(SpiceFi4626, "InvalidAddress");
    await expect(
      upgrades.deployProxy(SpiceFi4626, [
        weth.address,
        strategist.address,
        assetReceiver.address,
        10001,
      ])
    ).to.be.revertedWithCustomError(SpiceFi4626, "ParameterOutOfBounds");

    spiceVault = await upgrades.deployProxy(SpiceFi4626, [
      weth.address,
      strategist.address,
      assetReceiver.address,
      700,
    ]);

    await spiceVault.setMaxTotalSupply(ethers.constants.MaxUint256);

    defaultAdminRole = await spiceVault.DEFAULT_ADMIN_ROLE();
    strategistRole = await spiceVault.STRATEGIST_ROLE();
    vaultRole = await spiceVault.VAULT_ROLE();
    vaultReceiverRole = await spiceVault.VAULT_RECEIVER_ROLE();
    assetReceiverRole = await spiceVault.ASSET_RECEIVER_ROLE();
    userRole = await spiceVault.USER_ROLE();
    spiceRole = await spiceVault.SPICE_ROLE();

    await spiceVault.grantRole(strategistRole, strategist.address);
    await spiceVault.grantRole(vaultReceiverRole, vaultReceiver.address);
    await spiceVault.grantRole(vaultRole, vault.address);
    await spiceVault.grantRole(vaultRole, bend.address);
    await spiceVault.grantRole(vaultRole, drops.address);
    await checkRole(spiceVault, strategist.address, strategistRole, true);
    await checkRole(spiceVault, vaultReceiver.address, vaultReceiverRole, true);
    await checkRole(spiceVault, vault.address, vaultRole, true);
    await checkRole(spiceVault, bend.address, vaultRole, true);
    await checkRole(spiceVault, drops.address, vaultRole, true);

    await spiceVault.grantRole(spiceRole, spiceAdmin.address);
    await checkRole(spiceVault, spiceAdmin.address, spiceRole, true);
  });

  beforeEach(async () => {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  describe("Deployment", function () {
    it("Should set the correct name", async function () {
      expect(await spiceVault.name()).to.equal("SpiceToken");
    });

    it("Should set the correct symbol", async function () {
      expect(await spiceVault.symbol()).to.equal("SPICE");
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
      await checkRole(spiceVault, strategist.address, strategistRole, true);
      await checkRole(
        spiceVault,
        assetReceiver.address,
        assetReceiverRole,
        true
      );
      await checkRole(spiceVault, spiceVault.address, vaultReceiverRole, true);
    });

    it("Should initialize once", async function () {
      await expect(
        spiceVault.initialize(
          weth.address,
          strategist.address,
          assetReceiver.address,
          700
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should be upgraded only by default admin", async function () {
      let SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626", alice);

      await expect(
        upgrades.upgradeProxy(spiceVault.address, SpiceFi4626)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626", admin);

      await upgrades.upgradeProxy(spiceVault.address, SpiceFi4626);
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
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, whale.address);

        expect(await spiceVault.maxWithdraw(whale.address)).to.be.eq(assets);
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
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, whale.address);

        expect(await spiceVault.maxRedeem(whale.address)).to.be.eq(assets);
      });
    });
  });

  describe("User Actions", function () {
    describe("Deposit", function () {
      it("When there are no accounts with USER_ROLE", async function () {
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
        ).to.be.revertedWith("caller is not enabled");

        await spiceVault.grantRole(userRole, whale.address);

        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](amount, whale.address);
      });

      it("When depositing too much", async function () {
        const maxTotalSupply = ethers.utils.parseEther("100");
        await spiceVault.setMaxTotalSupply(maxTotalSupply);

        const amount = ethers.utils.parseEther("150");
        await weth.connect(whale).approve(spiceVault.address, amount);
        await expect(
          spiceVault
            .connect(whale)
            ["deposit(uint256,address)"](amount, whale.address)
        ).to.be.revertedWith("ERC4626: deposit more than max");
      });
    });

    describe("Withdraw", function () {
      beforeEach(async function () {
        const amount = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, amount);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](amount, whale.address);
      });

      it("Split fees properly", async function () {
        const amount = ethers.utils.parseEther("93");
        const beforeBalance1 = await weth.balanceOf(assetReceiver.address);
        const beforeBalance2 = await weth.balanceOf(spiceAdmin.address);
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

        expect(await weth.balanceOf(assetReceiver.address)).to.be.eq(
          beforeBalance1.add(fees1)
        );
        expect(await weth.balanceOf(spiceAdmin.address)).to.be.eq(
          beforeBalance2.add(fees2)
        );
        expect(await weth.balanceOf(whale.address)).to.be.eq(
          beforeBalance3.add(amount)
        );
      });
    });

    describe("Transfer", function () {
      beforeEach(async function () {
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
    describe("Approve", function () {
      it("Only strategist can call", async function () {
        const amount = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(alice)
            ["approve(address,address,uint256)"](
              vault.address,
              vaultReceiver.address,
              amount
            )
        ).to.be.revertedWith(
          `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
        );
      });

      it("Only approve vault token", async function () {
        const amount = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(strategist)
            ["approve(address,address,uint256)"](
              token.address,
              vaultReceiver.address,
              amount
            )
        ).to.be.revertedWith(
          `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
        );
      });

      it("Only approve to vault receiver", async function () {
        const amount = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(strategist)
            ["approve(address,address,uint256)"](
              vault.address,
              carol.address,
              amount
            )
        ).to.be.revertedWith(
          `AccessControl: account ${carol.address.toLowerCase()} is missing role ${vaultReceiverRole}`
        );
      });

      it("Approves correct amount", async function () {
        const amount = ethers.utils.parseEther("100");
        await spiceVault
          .connect(strategist)
          ["approve(address,address,uint256)"](
            vault.address,
            vaultReceiver.address,
            amount
          );
        expect(
          await vault.allowance(spiceVault.address, vaultReceiver.address)
        ).to.be.eq(amount);
      });
    });

    describe("Approve Asset", function () {
      it("Only strategist can call", async function () {
        const amount = ethers.utils.parseEther("100");
        await expect(
          spiceVault.connect(alice).approveAsset(vault.address, amount)
        ).to.be.revertedWith(
          `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
        );
      });

      it("Only approve to vault", async function () {
        const amount = ethers.utils.parseEther("100");
        await expect(
          spiceVault.connect(strategist).approveAsset(carol.address, amount)
        ).to.be.revertedWith(
          `AccessControl: account ${carol.address.toLowerCase()} is missing role ${vaultRole}`
        );
      });

      it("Approves correct amount", async function () {
        const amount = ethers.utils.parseEther("100");
        await spiceVault
          .connect(strategist)
          .approveAsset(vault.address, amount);
        expect(
          await weth.allowance(spiceVault.address, vault.address)
        ).to.be.eq(amount);
      });
    });

    describe("Deposit", function () {
      it("Only strategist can call", async function () {
        const assets = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(alice)
            ["deposit(address,uint256,address)"](
              vault.address,
              assets,
              vaultReceiver.address
            )
        ).to.be.revertedWith(
          `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
        );
      });

      it("Only deposit to vault", async function () {
        const assets = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(strategist)
            ["deposit(address,uint256,address)"](
              token.address,
              assets,
              vaultReceiver.address
            )
        ).to.be.revertedWith(
          `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
        );
      });

      it("Only vault receiver can receive shares", async function () {
        const assets = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(strategist)
            ["deposit(address,uint256,address)"](
              vault.address,
              assets,
              carol.address
            )
        ).to.be.revertedWith(
          `AccessControl: account ${carol.address.toLowerCase()} is missing role ${vaultReceiverRole}`
        );
      });

      it("Take assets and mint shares", async function () {
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, whale.address);
        await spiceVault
          .connect(strategist)
          .approveAsset(vault.address, ethers.constants.MaxUint256);

        await spiceVault
          .connect(strategist)
          ["deposit(address,uint256,address)"](
            vault.address,
            assets,
            vaultReceiver.address
          );

        expect(await vault.balanceOf(vaultReceiver.address)).to.be.eq(assets);
      });
    });

    describe("Mint", function () {
      it("Only strategist can call", async function () {
        const assets = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(alice)
            ["mint(address,uint256,address)"](
              vault.address,
              assets,
              vaultReceiver.address
            )
        ).to.be.revertedWith(
          `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
        );
      });

      it("Only mint to vault", async function () {
        const shares = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(strategist)
            ["mint(address,uint256,address)"](
              token.address,
              shares,
              vaultReceiver.address
            )
        ).to.be.revertedWith(
          `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
        );
      });

      it("Only vault receiver can receive shares", async function () {
        const shares = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(strategist)
            ["mint(address,uint256,address)"](
              vault.address,
              shares,
              carol.address
            )
        ).to.be.revertedWith(
          `AccessControl: account ${carol.address.toLowerCase()} is missing role ${vaultReceiverRole}`
        );
      });

      it("Take assets and mint shares", async function () {
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, whale.address);
        await spiceVault
          .connect(strategist)
          .approveAsset(vault.address, ethers.constants.MaxUint256);

        const shares = ethers.utils.parseEther("100");
        await spiceVault
          .connect(strategist)
          ["mint(address,uint256,address)"](
            vault.address,
            shares,
            vaultReceiver.address
          );

        expect(await vault.balanceOf(vaultReceiver.address)).to.be.eq(shares);
      });
    });

    describe("Withdraw", function () {
      beforeEach(async function () {
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, whale.address);
        await spiceVault
          .connect(strategist)
          .approveAsset(vault.address, ethers.constants.MaxUint256);

        const shares = ethers.utils.parseEther("100");
        await spiceVault
          .connect(strategist)
          ["mint(address,uint256,address)"](
            vault.address,
            shares,
            vaultReceiver.address
          );

        await vault
          .connect(vaultReceiver)
          .approve(spiceVault.address, ethers.constants.MaxUint256);
      });

      it("Only strategist can call", async function () {
        const assets = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(alice)
            ["withdraw(address,uint256,address,address)"](
              vault.address,
              assets,
              spiceVault.address,
              vaultReceiver.address
            )
        ).to.be.revertedWith(
          `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
        );
      });

      it("Only withdraw from vault", async function () {
        const assets = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(strategist)
            ["withdraw(address,uint256,address,address)"](
              token.address,
              assets,
              spiceVault.address,
              vaultReceiver.address
            )
        ).to.be.revertedWith(
          `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
        );
      });

      it("Only vault receiver can receive assets", async function () {
        const assets = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(strategist)
            ["withdraw(address,uint256,address,address)"](
              vault.address,
              assets,
              carol.address,
              vaultReceiver.address
            )
        ).to.be.revertedWith(
          `AccessControl: account ${carol.address.toLowerCase()} is missing role ${vaultReceiverRole}`
        );
      });

      it("Withdraw assets", async function () {
        const assets = ethers.utils.parseEther("50");
        await spiceVault
          .connect(strategist)
          ["withdraw(address,uint256,address,address)"](
            vault.address,
            assets,
            spiceVault.address,
            vaultReceiver.address
          );
      });
    });

    describe("Redeem", function () {
      beforeEach(async function () {
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, assets);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](assets, whale.address);
        await spiceVault
          .connect(strategist)
          .approveAsset(vault.address, ethers.constants.MaxUint256);

        const shares = ethers.utils.parseEther("100");
        await spiceVault
          .connect(strategist)
          ["mint(address,uint256,address)"](
            vault.address,
            shares,
            vaultReceiver.address
          );

        await vault
          .connect(vaultReceiver)
          .approve(spiceVault.address, ethers.constants.MaxUint256);
      });

      it("Only strategist can call", async function () {
        const shares = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(alice)
            ["redeem(address,uint256,address,address)"](
              vault.address,
              shares,
              spiceVault.address,
              vaultReceiver.address
            )
        ).to.be.revertedWith(
          `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
        );
      });

      it("Only redeem from vault", async function () {
        const shares = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(strategist)
            ["redeem(address,uint256,address,address)"](
              token.address,
              shares,
              spiceVault.address,
              vaultReceiver.address
            )
        ).to.be.revertedWith(
          `AccessControl: account ${token.address.toLowerCase()} is missing role ${vaultRole}`
        );
      });

      it("Only vault receiver can receive assets", async function () {
        const shares = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(strategist)
            ["redeem(address,uint256,address,address)"](
              vault.address,
              shares,
              carol.address,
              vaultReceiver.address
            )
        ).to.be.revertedWith(
          `AccessControl: account ${carol.address.toLowerCase()} is missing role ${vaultReceiverRole}`
        );
      });

      it("Redeem assets", async function () {
        const shares = ethers.utils.parseEther("50");
        await spiceVault
          .connect(strategist)
          ["redeem(address,uint256,address,address)"](
            vault.address,
            shares,
            spiceVault.address,
            vaultReceiver.address
          );
      });
    });

    describe("Transfer", function () {
      beforeEach(async function () {
        const amount = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, amount);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](amount, whale.address);
        await spiceVault
          .connect(strategist)
          .approveAsset(vault.address, ethers.constants.MaxUint256);

        const assets = ethers.utils.parseEther("30");
        await spiceVault
          .connect(strategist)
          ["deposit(address,uint256,address)"](
            vault.address,
            assets,
            spiceVault.address
          );
        await spiceVault
          .connect(strategist)
          ["deposit(address,uint256,address)"](
            vault.address,
            assets,
            vaultReceiver.address
          );
      });

      it("Only strategist can transfer", async function () {
        const amount = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(alice)
            ["transfer(address,address,uint256)"](
              vault.address,
              vaultReceiver.address,
              amount
            )
        ).to.be.revertedWith(
          `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
        );
      });

      it("Only transfer vault tokens", async function () {
        const amount = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(strategist)
            ["transfer(address,address,uint256)"](
              weth.address,
              vaultReceiver.address,
              amount
            )
        ).to.be.revertedWith(
          `AccessControl: account ${weth.address.toLowerCase()} is missing role ${vaultRole}`
        );
      });

      it("Only transfer to vault receiver", async function () {
        const amount = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(strategist)
            ["transfer(address,address,uint256)"](
              vault.address,
              carol.address,
              amount
            )
        ).to.be.revertedWith(
          `AccessControl: account ${carol.address.toLowerCase()} is missing role ${vaultReceiverRole}`
        );
      });

      it("When transfer amount exceeds balance", async function () {
        const amount = ethers.utils.parseEther("100");
        await expect(
          spiceVault
            .connect(strategist)
            ["transfer(address,address,uint256)"](
              vault.address,
              vaultReceiver.address,
              amount
            )
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      });

      it("Transfer correct amount", async function () {
        const amount = ethers.utils.parseEther("10");
        await spiceVault.grantRole(vaultReceiverRole, carol.address);

        await spiceVault
          .connect(strategist)
          ["transfer(address,address,uint256)"](
            vault.address,
            carol.address,
            amount
          );

        expect(await vault.balanceOf(carol.address)).to.be.eq(amount);
      });
    });

    describe("TransferFrom", function () {
      beforeEach(async function () {
        const amount = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(spiceVault.address, amount);
        await spiceVault
          .connect(whale)
          ["deposit(uint256,address)"](amount, whale.address);
        await spiceVault
          .connect(strategist)
          .approveAsset(vault.address, ethers.constants.MaxUint256);

        const assets = ethers.utils.parseEther("30");
        await spiceVault
          .connect(strategist)
          ["deposit(address,uint256,address)"](
            vault.address,
            assets,
            spiceVault.address
          );
        await spiceVault
          .connect(strategist)
          ["deposit(address,uint256,address)"](
            vault.address,
            assets,
            vaultReceiver.address
          );

        await spiceVault.grantRole(vaultReceiverRole, bob.address);
      });

      it("Only strategist can transfer", async function () {
        const amount = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(alice)
            ["transferFrom(address,address,address,uint256)"](
              vault.address,
              vaultReceiver.address,
              bob.address,
              amount
            )
        ).to.be.revertedWith(
          `AccessControl: account ${alice.address.toLowerCase()} is missing role ${strategistRole}`
        );
      });

      it("Only transfer vault tokens", async function () {
        const amount = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(strategist)
            ["transferFrom(address,address,address,uint256)"](
              weth.address,
              vaultReceiver.address,
              bob.address,
              amount
            )
        ).to.be.revertedWith(
          `AccessControl: account ${weth.address.toLowerCase()} is missing role ${vaultRole}`
        );
      });

      it("Only transfer to vault receiver", async function () {
        const amount = ethers.utils.parseEther("10");
        await expect(
          spiceVault
            .connect(strategist)
            ["transferFrom(address,address,address,uint256)"](
              vault.address,
              vaultReceiver.address,
              carol.address,
              amount
            )
        ).to.be.revertedWith(
          `AccessControl: account ${carol.address.toLowerCase()} is missing role ${vaultReceiverRole}`
        );
      });

      if (
        ("When not approved",
        async function () {
          const amount = ethers.utils.parseEther("10");
          await expect(
            spiceVault
              .connect(strategist)
              ["transferFrom(address,address,address,uint256)"](
                vault.address,
                vaultReceiver.address,
                bob.address,
                amount
              )
          ).to.be.revertedWith("ERC20: insufficient allowance");
        })
      )
        it("When transfer amount exceeds balance", async function () {
          const amount = ethers.utils.parseEther("100");
          await vault
            .connect(vaultReceiver)
            .approve(spiceVault.address, amount);
          await expect(
            spiceVault
              .connect(strategist)
              ["transferFrom(address,address,address,uint256)"](
                vault.address,
                vaultReceiver.address,
                bob.address,
                amount
              )
          ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

      it("Transfer correct amount", async function () {
        const amount = ethers.utils.parseEther("10");
        await spiceVault.grantRole(vaultReceiverRole, carol.address);
        await vault.connect(vaultReceiver).approve(spiceVault.address, amount);

        await spiceVault
          .connect(strategist)
          ["transferFrom(address,address,address,uint256)"](
            vault.address,
            vaultReceiver.address,
            bob.address,
            amount
          );

        expect(await vault.balanceOf(bob.address)).to.be.eq(amount);
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
