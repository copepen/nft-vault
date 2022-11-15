fs = require('fs');
const { takeSnapshot, revertToSnapshot } = require("./helpers/snapshot");
const { impersonateAccount } = require("./helpers/account");
const constants = require("./constants");
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("pyTest", function () {
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

	out = {
	    "vault":  vault.address,
	    "bend": bend.address,
	    "drops": drops.address,
	    "spiceVault": spiceVault.address
	};

	fs.writeFile('/opt/spice/dev/hh-contracts.json', JSON.stringify(out), function (err) {
	    if (err) console.log(err);
	});
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
  });
});

//
//fs = require('fs');
//const { expect } = require("chai");
//const { ethers, upgrades } = require("hardhat");
//const { impersonateAccount } = require("./helpers/account");
//const constants = require("./constants");
//
//describe("pyTest", function () {
    //// tokens
    //let weth;
//
    //// vaults
    //let vault;
    //let bend;
    //let drops;
    //let spiceVault;
//
    //// accounts
    //let admin,
	//alice,
	//bob,
	//carol,
	//strategist,
	//assetReceiver;
//
    //// constants
    //const vaultName = "Spice Vault Test Token";
    //const vaultSymbol = "svTT";
    //const bendVaultName = "Spice interest bearing WETH";
    //const bendVaultSymbol = "spiceETH";
    //const dropsVaultName = "Spice CEther";
    //const dropsVaultSymbol = "SCEther";
//
    //async function deployTokenAndAirdrop(users, amount) {
	//const Token = await ethers.getContractFactory("TestERC20");
	//const token = await Token.deploy("TestToken", "TT");
//
	//for (let i = 0; i < users.length; i++) {
	    //await token.mint(users[i].address, amount);
	//}
//
	//return token;
    //}
//
    //before("Deploy", async function () {
	//// mainnet fork
	//await network.provider.request({
	    //method: "hardhat_reset",
	    //params: [
		//{
		    //forking: {
			//jsonRpcUrl: process.env.MAINNET_RPC_URL || "",
		    //},
		//},
	    //],
	//});
//
	//[
	    //admin,
	    //alice,
	    //bob,
	    //carol,
	    //strategist,
	    //spiceAdmin,
	    //assetReceiver,
	    //vaultReceiver,
	//] = await ethers.getSigners();
//
	//whale = await ethers.getSigner(constants.accounts.Whale1);
	//await impersonateAccount(constants.accounts.Whale1);
//
	//const amount = ethers.utils.parseEther("1000000");
	//token = await deployTokenAndAirdrop([admin, alice, bob, carol], amount);
	//weth = await ethers.getContractAt(
	    //"TestERC20",
	    //constants.tokens.WETH,
	    //admin
	//);
//
	//const Vault = await ethers.getContractFactory("Vault");
//
	//vault = await upgrades.deployProxy(Vault, [
	    //vaultName,
	    //vaultSymbol,
	    //weth.address,
	//]);
//
	//const Bend4626 = await ethers.getContractFactory("Bend4626");
//
	//bend = await upgrades.deployProxy(Bend4626, [
	    //bendVaultName,
	    //bendVaultSymbol,
	    //constants.contracts.BendPool,
	    //constants.tokens.BendWETH,
	//]);
//
	//const Drops4626 = await ethers.getContractFactory("Drops4626");
//
	//drops = await upgrades.deployProxy(Drops4626, [
	    //dropsVaultName,
	    //dropsVaultSymbol,
	    //constants.tokens.DropsETH,
	//]);
//
	//const SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626");
//
	//spiceVault = await upgrades.deployProxy(SpiceFi4626, [
	    //weth.address,
	    //strategist.address,
	    //assetReceiver.address,
	    //700,
	//]);
	//out = {
	    //"vault":  vault.address,
	    //"bend": bend.address,
	    //"drops": drops.address,
	    //"spiceVault": spiceVault.address
	//};
//
	//fs.writeFile('/opt/spice/dev/hh-contracts.json', JSON.stringify(out), function (err) {
	    //if (err) console.log(err);
	//});
    //});
//
    //it("Should set the correct name", async function () {
	//expect(await spiceVault.name()).to.equal("SpiceToken");
    //});
//});