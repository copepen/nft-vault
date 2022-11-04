const { expect } = require("chai");
const { ethers, upgrades, network } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("./helpers/snapshot");
const { impersonateAccount } = require("./helpers/account");
const constants = require("./constants");

describe("Drops4626", function () {
  let vault;
  let token;
  let weth;
  let admin, alice, bob;
  let whale;
  let snapshotId;

  const name = "Spice CEther";
  const symbol = "SCEther";
  const ONE_WAD = ethers.utils.parseUnits("1", 18);

  const getExchangeRate = async () => {
    return await token.exchangeRateStored();
  };

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

    [admin, alice, bob] = await ethers.getSigners();
    whale = await ethers.getSigner(constants.accounts.Whale1);

    token = await ethers.getContractAt(
      "ICEther",
      constants.tokens.DropsETH,
      admin
    );
    weth = await ethers.getContractAt("IWETH", constants.tokens.WETH, admin);

    const Drops4626 = await ethers.getContractFactory("Drops4626");

    await expect(
      upgrades.deployProxy(Drops4626, [
        name,
        symbol,
        ethers.constants.AddressZero,
      ])
    ).to.be.revertedWithCustomError(Drops4626, "InvalidAddress");

    vault = await upgrades.deployProxy(Drops4626, [
      name,
      symbol,
      constants.tokens.DropsETH,
    ]);

    await impersonateAccount(whale.address);
  });

  beforeEach(async () => {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  describe("Deployment", function () {
    it("Should set the correct name", async function () {
      expect(await vault.name()).to.equal(name);
    });

    it("Should set the correct symbol", async function () {
      expect(await vault.symbol()).to.equal(symbol);
    });

    it("Should set the correct decimal", async function () {
      expect(await vault.decimals()).to.equal(await token.decimals());
    });

    it("Should return correct asset", async function () {
      expect(await vault.asset()).to.equal(constants.tokens.WETH);
    });

    it("Should initialize once", async function () {
      await expect(
        vault.initialize(name, symbol, constants.tokens.DropsETH)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("Getters", function () {
    describe("convertToShares", function () {
      it("Zero assets", async function () {
        expect(await vault.convertToShares(0)).to.be.eq(0);
      });

      it("Non-zero assets", async function () {
        const assets = ethers.utils.parseEther("100");
        const exchangeRate = await getExchangeRate();
        expect(await vault.convertToShares(assets)).to.be.eq(
          assets.mul(ONE_WAD).div(exchangeRate)
        );
      });
    });

    describe("convertToAssets", function () {
      it("Zero shares", async function () {
        expect(await vault.convertToAssets(0)).to.be.eq(0);
      });

      it("Non-zero shares", async function () {
        const shares = ethers.utils.parseEther("100");
        const exchangeRate = await getExchangeRate();
        expect(await vault.convertToAssets(shares)).to.be.eq(
          shares.mul(exchangeRate).div(ONE_WAD)
        );
      });
    });

    describe("previewDeposit", function () {
      it("Zero assets", async function () {
        expect(await vault.previewDeposit(0)).to.be.eq(0);
      });

      it("Non-zero assets", async function () {
        const assets = ethers.utils.parseEther("100");
        const exchangeRate = await getExchangeRate();
        expect(await vault.previewDeposit(assets)).to.be.eq(
          assets.mul(ONE_WAD).div(exchangeRate)
        );
      });
    });

    describe("previewMint", function () {
      it("Zero shares", async function () {
        expect(await vault.previewMint(0)).to.be.eq(0);
      });

      it("Non-zero shares", async function () {
        const shares = ethers.utils.parseEther("100");
        const exchangeRate = await getExchangeRate();
        expect(await vault.previewMint(shares)).to.be.eq(
          shares.mul(exchangeRate).div(ONE_WAD)
        );
      });
    });

    describe("previewWithdraw", function () {
      it("Zero assets", async function () {
        expect(await vault.previewWithdraw(0)).to.be.eq(0);
      });

      it("Non-zero assets", async function () {
        const assets = ethers.utils.parseEther("100");
        const exchangeRate = await getExchangeRate();
        expect(await vault.previewWithdraw(assets)).to.be.closeTo(
          assets.mul(ONE_WAD).div(exchangeRate),
          1
        );
      });
    });

    describe("previewRedeem", function () {
      it("Zero shares", async function () {
        expect(await vault.previewRedeem(0)).to.be.eq(0);
      });

      it("Non-zero shares", async function () {
        const shares = ethers.utils.parseEther("100");
        const exchangeRate = await getExchangeRate();
        expect(await vault.previewRedeem(shares)).to.be.closeTo(
          shares.mul(exchangeRate).div(ONE_WAD),
          1
        );
      });
    });

    it("maxDeposit", async function () {
      expect(await vault.maxDeposit(whale.address)).to.be.eq(
        ethers.constants.MaxUint256
      );
    });

    it("maxMint", async function () {
      expect(await vault.maxMint(whale.address)).to.be.eq(
        ethers.constants.MaxUint256
      );
    });

    describe("maxWithdraw", function () {
      it("When balance is zero", async function () {
        expect(await vault.maxWithdraw(whale.address)).to.be.eq(0);
      });

      it("When balance is non-zero", async function () {
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(vault.address, assets);
        await vault.connect(whale).deposit(assets, whale.address);

        expect(await vault.maxWithdraw(whale.address)).to.be.eq(
          await vault.convertToAssets(await vault.balanceOf(whale.address))
        );
      });
    });

    describe("maxRedeem", function () {
      it("When balance is zero", async function () {
        expect(await vault.maxRedeem(whale.address)).to.be.eq(0);
      });

      it("When balance is non-zero", async function () {
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(vault.address, assets);
        await vault.connect(whale).deposit(assets, whale.address);

        expect(await vault.maxRedeem(whale.address)).to.be.eq(
          await vault.balanceOf(whale.address)
        );
      });
    });
  });

  describe("User Actions", function () {
    describe("Deposit", function () {
      it("When deposits 0 assets", async function () {
        await expect(
          vault.connect(whale).deposit(0, whale.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When asset is not approved", async function () {
        const assets = ethers.utils.parseEther("100");

        await expect(
          vault.connect(whale).deposit(assets, whale.address)
        ).to.be.revertedWithoutReason();
      });

      it("When balance is not enough", async function () {
        const assets = ethers.utils.parseEther("100");

        await weth.connect(alice).approve(vault.address, assets);

        await expect(
          vault.connect(alice).deposit(assets, alice.address)
        ).to.be.revertedWithoutReason();
      });

      it("Take assets and mint shares", async function () {
        const assets = ethers.utils.parseEther("100");
        const shares = await vault.previewDeposit(assets);

        await weth.connect(whale).approve(vault.address, assets);

        const beforeAssetBalance = await weth.balanceOf(whale.address);

        const tx = await vault.connect(whale).deposit(assets, bob.address);

        const shareBalance = await vault.balanceOf(bob.address);
        expect(shareBalance).to.be.closeTo(
          shares,
          assets.div(ethers.utils.parseUnits("1", 12))
        );
        expect(await weth.balanceOf(whale.address)).to.be.eq(
          beforeAssetBalance.sub(assets)
        );

        await expect(tx)
          .to.emit(vault, "Deposit")
          .withArgs(whale.address, bob.address, assets, shareBalance);
        await expect(tx)
          .to.emit(vault, "Transfer")
          .withArgs(ethers.constants.AddressZero, bob.address, shareBalance);

        expect(await vault.totalSupply()).to.be.eq(shareBalance);
        expect(await vault.totalAssets()).to.be.eq(
          await vault.convertToAssets(shareBalance)
        );
      });
    });

    describe("Mint", function () {
      it("When mints 0 shares", async function () {
        await expect(
          vault.connect(whale).mint(0, whale.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When asset is not approved", async function () {
        const shares = ethers.utils.parseUnits("1000", 6);

        await expect(
          vault.connect(whale).mint(shares, whale.address)
        ).to.be.revertedWithoutReason();
      });

      it("When balance is not enough", async function () {
        const shares = ethers.utils.parseUnits("1000", 6);

        await weth.connect(alice).approve(vault.address, shares);

        await expect(
          vault.connect(alice).mint(shares, alice.address)
        ).to.be.revertedWithoutReason();
      });

      it("Take assets and mint shares", async function () {
        const shares = ethers.utils.parseUnits("1000", 6);
        const assets = await vault.previewMint(shares);

        await weth.connect(whale).approve(vault.address, assets.mul(2));

        const beforeAssetBalance = await weth.balanceOf(whale.address);

        const tx = await vault.connect(whale).mint(shares, bob.address);

        const shareBalance = await vault.balanceOf(bob.address);
        expect(shareBalance).to.be.closeTo(
          shares,
          assets.div(ethers.utils.parseUnits("1", 12))
        );
        expect(await weth.balanceOf(whale.address)).to.be.eq(
          beforeAssetBalance.sub(assets)
        );

        await expect(tx)
          .to.emit(vault, "Deposit")
          .withArgs(whale.address, bob.address, assets, shareBalance);
        await expect(tx)
          .to.emit(vault, "Transfer")
          .withArgs(ethers.constants.AddressZero, bob.address, shareBalance);

        expect(await vault.totalSupply()).to.be.eq(shareBalance);
        expect(await vault.totalAssets()).to.be.eq(
          await vault.convertToAssets(shareBalance)
        );
      });
    });

    describe("Withdraw", function () {
      beforeEach(async function () {
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(vault.address, assets);
        await vault.connect(whale).deposit(assets, whale.address);
      });

      it("When receiver is 0x0", async function () {
        await expect(
          vault
            .connect(whale)
            .withdraw(0, ethers.constants.AddressZero, whale.address)
        ).to.be.revertedWithCustomError(vault, "InvalidAddress");
      });

      it("When withdraw 0 amount", async function () {
        await expect(
          vault.connect(whale).withdraw(0, whale.address, whale.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When allowance is not enough", async function () {
        const assets = ethers.utils.parseEther("50");

        await expect(
          vault.connect(alice).withdraw(assets, alice.address, whale.address)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When share balance is not enough", async function () {
        const assets = ethers.utils.parseEther("200");

        await expect(
          vault.connect(whale).withdraw(assets, bob.address, whale.address)
        ).to.be.revertedWith("ERC20: burn amount exceeds balance");
      });

      it("Withdraw assets", async function () {
        const assets = ethers.utils.parseEther("50");
        const shares = await vault.previewWithdraw(assets);

        const beforeAssetBalance = await weth.balanceOf(bob.address);
        const beforeShareBalance = await vault.balanceOf(whale.address);

        await vault.connect(whale).withdraw(assets, bob.address, whale.address);

        const afterAssetBalance = await weth.balanceOf(bob.address);
        const afterShareBalance = await vault.balanceOf(whale.address);

        expect(afterAssetBalance).to.be.closeTo(
          beforeAssetBalance.add(assets),
          assets.div(1000000)
        );
        expect(beforeShareBalance).to.be.closeTo(
          afterShareBalance.add(shares),
          shares.div(100000)
        );
      });
    });

    describe("Redeem", function () {
      beforeEach(async function () {
        const assets = ethers.utils.parseEther("100");
        await weth.connect(whale).approve(vault.address, assets);
        await vault.connect(whale).deposit(assets, whale.address);
      });

      it("When receiver is 0x0", async function () {
        await expect(
          vault
            .connect(whale)
            .redeem(0, ethers.constants.AddressZero, whale.address)
        ).to.be.revertedWithCustomError(vault, "InvalidAddress");
      });

      it("When redeem 0 amount", async function () {
        await expect(
          vault.connect(whale).redeem(0, whale.address, whale.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When allowance is not enough", async function () {
        const shares = ethers.utils.parseUnits("100", 6);

        await expect(
          vault.connect(alice).redeem(shares, alice.address, whale.address)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When shares balance is not enough", async function () {
        const shares = (await vault.balanceOf(whale.address)).add(1);

        await expect(
          vault.connect(whale).redeem(shares, bob.address, whale.address)
        ).to.be.revertedWith("ERC20: burn amount exceeds balance");
      });

      it("Redeem shares", async function () {
        const shares = ethers.utils.parseUnits("100", 6);
        const assets = await vault.previewRedeem(shares);

        const beforeAssetBalance = await weth.balanceOf(bob.address);
        const beforeShareBalance = await vault.balanceOf(whale.address);

        await vault.connect(whale).redeem(shares, bob.address, whale.address);

        const afterAssetBalance = await weth.balanceOf(bob.address);
        const afterShareBalance = await vault.balanceOf(whale.address);

        expect(afterAssetBalance).to.be.closeTo(
          beforeAssetBalance.add(assets),
          assets.div(1000000)
        );
        expect(beforeShareBalance).to.be.eq(afterShareBalance.add(shares));
      });
    });
  });
});
