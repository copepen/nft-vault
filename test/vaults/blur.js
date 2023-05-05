const { expect } = require("chai");
const { ethers, upgrades, network } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("../helpers/snapshot");
const { impersonateAccount } = require("../helpers/account");
const constants = require("../constants");

describe("Blur4626", function () {
  let vault;
  let weth;
  let admin, alice, bob;
  let bidder;
  let snapshotId;

  let defaultAdminRole;

  const name = "Spice interest bearing WETH";
  const symbol = "spiceETH";

  before("Deploy", async function () {
    [admin, alice, bob] = await ethers.getSigners();

    await impersonateAccount(constants.accounts.BlurBidder);
    bidder = await ethers.getSigner(constants.accounts.BlurBidder);

    weth = await ethers.getContractAt("IWETH", constants.tokens.WETH, admin);

    const Blur4626 = await ethers.getContractFactory("Blur4626");
    const beacon = await upgrades.deployBeacon(Blur4626);

    await expect(
      upgrades.deployBeaconProxy(beacon, Blur4626, [
        name,
        symbol,
        ethers.constants.AddressZero,
      ])
    ).to.be.revertedWithCustomError(Blur4626, "InvalidAddress");

    vault = await upgrades.deployBeaconProxy(beacon, Blur4626, [
      name,
      symbol,
      constants.accounts.BlurBidder,
    ]);

    defaultAdminRole = await vault.DEFAULT_ADMIN_ROLE();
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
      expect(await vault.decimals()).to.equal(18);
    });

    it("Should return correct asset", async function () {
      expect(await vault.asset()).to.equal(constants.tokens.WETH);
    });

    it("Should initialize once", async function () {
      await expect(
        vault.initialize(name, symbol, constants.accounts.BlurBidder)
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
        expect(await vault.convertToShares(assets)).to.be.eq(assets);
      });
    });

    describe("convertToAssets", function () {
      it("Zero shares", async function () {
        expect(await vault.convertToAssets(0)).to.be.eq(0);
      });

      it("Non-zero shares", async function () {
        const shares = ethers.utils.parseEther("100");
        expect(await vault.convertToAssets(shares)).to.be.eq(shares);
      });
    });

    describe("previewDeposit", function () {
      it("Zero assets", async function () {
        expect(await vault.previewDeposit(0)).to.be.eq(0);
      });

      it("Non-zero assets", async function () {
        const assets = ethers.utils.parseEther("100");
        expect(await vault.previewDeposit(assets)).to.be.eq(assets);
      });
    });

    describe("previewMint", function () {
      it("Zero shares", async function () {
        expect(await vault.previewMint(0)).to.be.eq(0);
      });

      it("Non-zero shares", async function () {
        const shares = ethers.utils.parseEther("100");
        expect(await vault.previewMint(shares)).to.be.eq(shares);
      });
    });

    describe("previewWithdraw", function () {
      it("Zero assets", async function () {
        expect(await vault.previewWithdraw(0)).to.be.eq(0);
      });

      it("Non-zero assets", async function () {
        const assets = ethers.utils.parseEther("100");
        expect(await vault.previewWithdraw(assets)).to.be.eq(assets);
      });
    });

    describe("previewRedeem", function () {
      it("Zero shares", async function () {
        expect(await vault.previewRedeem(0)).to.be.eq(0);
      });

      it("Non-zero shares", async function () {
        const shares = ethers.utils.parseEther("100");
        expect(await vault.previewRedeem(shares)).to.be.eq(shares);
      });
    });

    it("maxDeposit", async function () {
      expect(await vault.maxDeposit(alice.address)).to.be.eq(
        ethers.constants.MaxUint256
      );
    });

    it("maxMint", async function () {
      expect(await vault.maxMint(alice.address)).to.be.eq(
        ethers.constants.MaxUint256
      );
    });

    describe("maxWithdraw", function () {
      it("When balance is zero", async function () {
        expect(await vault.maxWithdraw(alice.address)).to.be.eq(0);
      });

      it("When balance is non-zero", async function () {
        weth.connect(alice).deposit({ value: ethers.utils.parseEther("200") });

        const assets = ethers.utils.parseEther("100");
        await weth.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, alice.address);

        const bidderBalance = await weth.balanceOf(bidder.address);

        expect(await vault.maxWithdraw(alice.address)).to.be.eq(
          bidderBalance.lt(assets) ? bidderBalance : assets
        );
      });
    });

    describe("maxRedeem", function () {
      it("When balance is zero", async function () {
        expect(await vault.maxRedeem(alice.address)).to.be.eq(0);
      });

      it("When balance is non-zero", async function () {
        weth.connect(alice).deposit({ value: ethers.utils.parseEther("200") });

        const assets = ethers.utils.parseEther("100");
        await weth.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, alice.address);

        const bidderBalance = await weth.balanceOf(bidder.address);

        expect(await vault.maxRedeem(alice.address)).to.be.eq(
          await vault.convertToShares(
            bidderBalance.lt(assets) ? bidderBalance : assets
          )
        );
      });
    });

    describe("totalAssets", function () {
      it("When there is no deposit", async function () {
        expect(await vault.totalAssets()).to.be.eq(0);
      });

      it("When there is deposit", async function () {
        weth.connect(alice).deposit({ value: ethers.utils.parseEther("200") });

        const assets = ethers.utils.parseEther("100");
        await weth.connect(alice).approve(vault.address, assets);
        await vault.connect(alice).deposit(assets, alice.address);

        expect(await vault.totalAssets()).to.be.closeTo(assets, 1);
      });
    });
  });

  describe("User Actions", function () {
    describe("Deposit", function () {
      it("When deposits 0 assets", async function () {
        await expect(
          vault.connect(alice).deposit(0, alice.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When receiver is 0x0", async function () {
        const assets = ethers.utils.parseEther("100");

        await expect(
          vault.connect(alice).deposit(assets, ethers.constants.AddressZero)
        ).to.be.revertedWithCustomError(vault, "InvalidAddress");
      });

      it("When asset is not approved", async function () {
        const assets = ethers.utils.parseEther("100");

        await expect(
          vault.connect(alice).deposit(assets, alice.address)
        ).to.be.revertedWith("SafeERC20: low-level call failed");
      });

      it("When balance is not enough", async function () {
        weth.connect(alice).deposit({ value: ethers.utils.parseEther("200") });

        const assets = ethers.utils.parseEther("300");

        await weth.connect(alice).approve(vault.address, assets);

        await expect(
          vault.connect(alice).deposit(assets, alice.address)
        ).to.be.revertedWith("SafeERC20: low-level call failed");
      });

      it("Take assets and mint shares", async function () {
        weth.connect(alice).deposit({ value: ethers.utils.parseEther("200") });

        const assets = ethers.utils.parseEther("100");
        const shares = await vault.previewDeposit(assets);

        await weth.connect(alice).approve(vault.address, assets);

        const beforeAssetBalance = await weth.balanceOf(alice.address);
        const beforeShareBalance = await vault.balanceOf(bob.address);
        const beforeBidderBalance = await ethers.provider.getBalance(
          bidder.address
        );

        const tx = await vault.connect(alice).deposit(assets, bob.address);

        expect(await vault.balanceOf(bob.address)).to.be.eq(
          beforeShareBalance.add(shares)
        );
        expect(await weth.balanceOf(alice.address)).to.be.eq(
          beforeAssetBalance.sub(assets)
        );
        expect(await ethers.provider.getBalance(bidder.address)).to.be.eq(
          beforeBidderBalance.add(assets)
        );

        await expect(tx)
          .to.emit(vault, "Deposit")
          .withArgs(alice.address, bob.address, assets, shares);
        await expect(tx)
          .to.emit(vault, "Transfer")
          .withArgs(ethers.constants.AddressZero, bob.address, shares);

        expect(await vault.totalSupply()).to.be.eq(shares);
        expect(await vault.totalAssets()).to.be.eq(
          await vault.convertToAssets(shares)
        );
      });
    });

    describe("Mint", function () {
      it("When mints 0 shares", async function () {
        await expect(
          vault.connect(alice).mint(0, alice.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When receiver is 0x0", async function () {
        const shares = ethers.utils.parseEther("100");

        await expect(
          vault.connect(alice).mint(shares, ethers.constants.AddressZero)
        ).to.be.revertedWithCustomError(vault, "InvalidAddress");
      });

      it("When asset is not approved", async function () {
        const shares = ethers.utils.parseEther("100");

        await expect(
          vault.connect(alice).mint(shares, alice.address)
        ).to.be.revertedWith("SafeERC20: low-level call failed");
      });

      it("When balance is not enough", async function () {
        weth.connect(alice).deposit({ value: ethers.utils.parseEther("200") });

        const shares = ethers.utils.parseEther("300");

        await weth.connect(alice).approve(vault.address, shares);

        await expect(
          vault.connect(alice).mint(shares, alice.address)
        ).to.be.revertedWith("SafeERC20: low-level call failed");
      });

      it("Take assets and mint shares", async function () {
        weth.connect(alice).deposit({ value: ethers.utils.parseEther("200") });

        const shares = ethers.utils.parseEther("100");
        const assets = await vault.previewMint(shares);

        await weth.connect(alice).approve(vault.address, assets);

        const beforeAssetBalance = await weth.balanceOf(alice.address);
        const beforeShareBalance = await vault.balanceOf(bob.address);
        const beforeBidderBalance = await ethers.provider.getBalance(
          bidder.address
        );

        const tx = await vault.connect(alice).mint(shares, bob.address);

        expect(await vault.balanceOf(bob.address)).to.be.eq(
          beforeShareBalance.add(shares)
        );
        expect(await weth.balanceOf(alice.address)).to.be.eq(
          beforeAssetBalance.sub(assets)
        );
        expect(await ethers.provider.getBalance(bidder.address)).to.be.eq(
          beforeBidderBalance.add(assets)
        );

        await expect(tx)
          .to.emit(vault, "Deposit")
          .withArgs(alice.address, bob.address, assets, shares);
        await expect(tx)
          .to.emit(vault, "Transfer")
          .withArgs(ethers.constants.AddressZero, bob.address, shares);

        expect(await vault.totalSupply()).to.be.eq(shares);
        expect(await vault.totalAssets()).to.be.eq(
          await vault.convertToAssets(shares)
        );
      });
    });

    describe("Withdraw", function () {
      beforeEach(async function () {
        const assets = ethers.utils.parseEther("100");
        await vault.connect(alice).depositETH(alice.address, { value: assets });
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
          vault.connect(alice).withdraw(0, alice.address, alice.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When allowance is not enough", async function () {
        const assets = ethers.utils.parseEther("50");

        await expect(
          vault.connect(bob).withdraw(assets, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When share balance is not enough", async function () {
        const assets = ethers.utils.parseEther("200");

        await expect(
          vault.connect(alice).withdraw(assets, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: burn amount exceeds balance");
      });

      it("Withdraw assets", async function () {
        const assets = ethers.utils.parseEther("50");

        await weth
          .connect(bidder)
          .deposit({ value: ethers.utils.parseEther("60") });
        await weth
          .connect(bidder)
          .approve(vault.address, ethers.constants.MaxUint256);

        const beforeAssetBalance = await weth.balanceOf(bob.address);
        const beforeBidderBalance = await weth.balanceOf(bidder.address);
        const beforeShareBalance = await vault.balanceOf(alice.address);

        await vault.connect(alice).withdraw(assets, bob.address, alice.address);

        const afterAssetBalance = await weth.balanceOf(bob.address);
        const afterBidderBalance = await weth.balanceOf(bidder.address);
        const afterShareBalance = await vault.balanceOf(alice.address);

        const shares = await vault.previewWithdraw(assets);

        expect(afterAssetBalance).to.be.eq(beforeAssetBalance.add(assets));
        expect(afterBidderBalance).to.be.eq(beforeBidderBalance.sub(assets));
        expect(beforeShareBalance).to.be.eq(afterShareBalance.add(shares));
      });
    });

    describe("Redeem", function () {
      beforeEach(async function () {
        const assets = ethers.utils.parseEther("100");
        await vault.connect(alice).depositETH(alice.address, { value: assets });
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
          vault.connect(alice).redeem(0, alice.address, alice.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When allowance is not enough", async function () {
        const shares = ethers.utils.parseEther("50");

        await expect(
          vault.connect(bob).redeem(shares, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When shares balance is not enough", async function () {
        const shares = ethers.utils.parseEther("200");

        await expect(
          vault.connect(alice).redeem(shares, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: burn amount exceeds balance");
      });

      it("Redeem shares", async function () {
        const shares = ethers.utils.parseEther("50");

        await weth
          .connect(bidder)
          .deposit({ value: ethers.utils.parseEther("60") });
        await weth
          .connect(bidder)
          .approve(vault.address, ethers.constants.MaxUint256);

        const beforeAssetBalance = await weth.balanceOf(bob.address);
        const beforeBidderBalance = await weth.balanceOf(bidder.address);
        const beforeShareBalance = await vault.balanceOf(alice.address);

        await vault.connect(alice).redeem(shares, bob.address, alice.address);

        const afterAssetBalance = await weth.balanceOf(bob.address);
        const afterBidderBalance = await weth.balanceOf(bidder.address);
        const afterShareBalance = await vault.balanceOf(alice.address);

        const assets = await vault.previewRedeem(shares);

        expect(afterAssetBalance).to.be.eq(beforeAssetBalance.add(assets));
        expect(afterBidderBalance).to.be.eq(beforeBidderBalance.sub(assets));
        expect(beforeShareBalance).to.be.eq(afterShareBalance.add(shares));
      });
    });

    describe("Deposit ETH", function () {
      it("When deposits 0 assets", async function () {
        await expect(
          vault.connect(alice).depositETH(alice.address, { value: 0 })
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When receiver is 0x0", async function () {
        const assets = ethers.utils.parseEther("100");

        await expect(
          vault
            .connect(alice)
            .depositETH(ethers.constants.AddressZero, { value: assets })
        ).to.be.revertedWithCustomError(vault, "InvalidAddress");
      });

      it("Take assets and mint shares", async function () {
        const assets = ethers.utils.parseEther("100");
        const shares = await vault.previewDeposit(assets);

        const beforeAssetBalance = await ethers.provider.getBalance(
          alice.address
        );
        const beforeShareBalance = await vault.balanceOf(bob.address);
        const beforeBidderBalance = await ethers.provider.getBalance(
          bidder.address
        );

        const tx = await vault
          .connect(alice)
          .depositETH(bob.address, { value: assets });

        expect(await vault.balanceOf(bob.address)).to.be.eq(
          beforeShareBalance.add(shares)
        );
        expect(await ethers.provider.getBalance(alice.address)).to.be.closeTo(
          beforeAssetBalance.sub(assets),
          ethers.utils.parseEther("0.05")
        );
        expect(await ethers.provider.getBalance(bidder.address)).to.be.eq(
          beforeBidderBalance.add(assets)
        );

        await expect(tx)
          .to.emit(vault, "Deposit")
          .withArgs(alice.address, bob.address, assets, shares);
        await expect(tx)
          .to.emit(vault, "Transfer")
          .withArgs(ethers.constants.AddressZero, bob.address, shares);

        expect(await vault.totalSupply()).to.be.eq(shares);
        expect(await vault.totalAssets()).to.be.eq(
          await vault.convertToAssets(shares)
        );
      });
    });

    describe("Mint ETH", function () {
      it("When mints 0 shares", async function () {
        await expect(
          vault.connect(alice).mintETH(0, alice.address, { value: 0 })
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When receiver is 0x0", async function () {
        const shares = ethers.utils.parseEther("100");

        await expect(
          vault
            .connect(alice)
            .mintETH(shares, ethers.constants.AddressZero, { value: shares })
        ).to.be.revertedWithCustomError(vault, "InvalidAddress");
      });

      it("Take assets and mint shares", async function () {
        const shares = ethers.utils.parseEther("100");
        const assets = await vault.previewMint(shares);

        await weth.connect(alice).approve(vault.address, assets);

        const beforeAssetBalance = await ethers.provider.getBalance(
          alice.address
        );
        const beforeShareBalance = await vault.balanceOf(bob.address);
        const beforeBidderBalance = await ethers.provider.getBalance(
          bidder.address
        );

        const tx = await vault
          .connect(alice)
          .mintETH(shares, bob.address, { value: shares });

        expect(await vault.balanceOf(bob.address)).to.be.eq(
          beforeShareBalance.add(shares)
        );
        expect(await ethers.provider.getBalance(alice.address)).to.be.closeTo(
          beforeAssetBalance.sub(assets),
          ethers.utils.parseEther("0.05")
        );
        expect(await ethers.provider.getBalance(bidder.address)).to.be.eq(
          beforeBidderBalance.add(assets)
        );

        await expect(tx)
          .to.emit(vault, "Deposit")
          .withArgs(alice.address, bob.address, assets, shares);
        await expect(tx)
          .to.emit(vault, "Transfer")
          .withArgs(ethers.constants.AddressZero, bob.address, shares);

        expect(await vault.totalSupply()).to.be.eq(shares);
        expect(await vault.totalAssets()).to.be.eq(
          await vault.convertToAssets(shares)
        );
      });
    });

    describe("Withdraw ETH", function () {
      beforeEach(async function () {
        const assets = ethers.utils.parseEther("100");
        await vault.connect(alice).depositETH(alice.address, { value: assets });
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
          vault.connect(alice).withdrawETH(0, alice.address, alice.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When allowance is not enough", async function () {
        const assets = ethers.utils.parseEther("50");

        await expect(
          vault.connect(bob).withdrawETH(assets, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When share balance is not enough", async function () {
        const assets = ethers.utils.parseEther("200");

        await expect(
          vault.connect(alice).withdrawETH(assets, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: burn amount exceeds balance");
      });

      it("Withdraw assets", async function () {
        const assets = ethers.utils.parseEther("50");

        await weth
          .connect(bidder)
          .deposit({ value: ethers.utils.parseEther("60") });
        await weth
          .connect(bidder)
          .approve(vault.address, ethers.constants.MaxUint256);

        const beforeAssetBalance = await ethers.provider.getBalance(
          bob.address
        );
        const beforeBidderBalance = await weth.balanceOf(bidder.address);
        const beforeShareBalance = await vault.balanceOf(alice.address);

        await vault
          .connect(alice)
          .withdrawETH(assets, bob.address, alice.address);

        const afterAssetBalance = await ethers.provider.getBalance(bob.address);
        const afterBidderBalance = await weth.balanceOf(bidder.address);
        const afterShareBalance = await vault.balanceOf(alice.address);

        const shares = await vault.previewWithdraw(assets);

        expect(afterAssetBalance).to.be.eq(beforeAssetBalance.add(assets));
        expect(afterBidderBalance).to.be.eq(beforeBidderBalance.sub(assets));
        expect(beforeShareBalance).to.be.eq(afterShareBalance.add(shares));
      });
    });

    describe("Redeem ETH", function () {
      beforeEach(async function () {
        const assets = ethers.utils.parseEther("100");
        await vault.connect(alice).depositETH(alice.address, { value: assets });
      });

      it("When receiver is 0x0", async function () {
        await expect(
          vault
            .connect(alice)
            .redeemETH(0, ethers.constants.AddressZero, alice.address)
        ).to.be.revertedWithCustomError(vault, "InvalidAddress");
      });

      it("When redeem 0 amount", async function () {
        await expect(
          vault.connect(alice).redeemETH(0, alice.address, alice.address)
        ).to.be.revertedWithCustomError(vault, "ParameterOutOfBounds");
      });

      it("When allowance is not enough", async function () {
        const shares = ethers.utils.parseEther("50");

        await expect(
          vault.connect(bob).redeemETH(shares, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("When shares balance is not enough", async function () {
        const shares = ethers.utils.parseEther("200");

        await expect(
          vault.connect(alice).redeemETH(shares, bob.address, alice.address)
        ).to.be.revertedWith("ERC20: burn amount exceeds balance");
      });

      it("Redeem shares", async function () {
        const shares = ethers.utils.parseEther("50");

        await weth
          .connect(bidder)
          .deposit({ value: ethers.utils.parseEther("60") });
        await weth
          .connect(bidder)
          .approve(vault.address, ethers.constants.MaxUint256);

        const beforeAssetBalance = await ethers.provider.getBalance(
          bob.address
        );
        const beforeBidderBalance = await weth.balanceOf(bidder.address);
        const beforeShareBalance = await vault.balanceOf(alice.address);

        await vault
          .connect(alice)
          .redeemETH(shares, bob.address, alice.address);

        const afterAssetBalance = await ethers.provider.getBalance(bob.address);
        const afterBidderBalance = await weth.balanceOf(bidder.address);
        const afterShareBalance = await vault.balanceOf(alice.address);

        const assets = await vault.previewRedeem(shares);

        expect(afterAssetBalance).to.be.eq(beforeAssetBalance.add(assets));
        expect(afterBidderBalance).to.be.eq(beforeBidderBalance.sub(assets));
        expect(beforeShareBalance).to.be.eq(afterShareBalance.add(shares));
      });
    });
  });
});
