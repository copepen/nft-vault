const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("../helpers/snapshot");
const { impersonateAccount, setBalance } = require("../helpers/account");
const { signLoanTerms } = require("../helpers/sign");
const constants = require("../constants");
const { increaseTime } = require("../helpers/time");

const INVALID_SIGNATURE1 = "0x0000";
const INVALID_SIGNATURE2 =
  "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

describe("Spice Lending", function () {
  let vault;
  let lending;
  let lenderNote, borrowerNote;
  let nft, nft1, nft2;
  let weth;
  let admin, alice, bob, treasury, signer, spiceAdmin;
  let whale, dev;
  let snapshotId;

  let defaultAdminRole, spiceRole, signerRole, spiceNftRole;

  async function deployNFT() {
    const TestERC721 = await ethers.getContractFactory("TestERC721");
    const nft = await TestERC721.deploy("TestNFT", "NFT", "baseuri");

    return nft;
  }

  async function checkRole(contract, user, role, check) {
    expect(await contract.hasRole(role, user)).to.equal(check);
  }

  async function initiateTestLoan(user, collateralId, priceLiquidation) {
    const loanTerms = {
      lender: signer.address,
      loanAmount: ethers.utils.parseEther("10"),
      interestRate: 500,
      duration: 10 * 24 * 3600, // 10 days
      collateralAddress: nft.address,
      collateralId,
      borrower: user.address,
      expiration: Math.floor(Date.now() / 1000) + 30 * 60,
      currency: weth.address,
      priceLiquidation,
    };
    await nft.connect(user).setApprovalForAll(lending.address, true);
    await weth
      .connect(signer)
      .approve(lending.address, ethers.constants.MaxUint256);
    const signature = await signLoanTerms(signer, lending.address, loanTerms);
    const loanId = await lending
      .connect(user)
      .callStatic.initiateLoan(loanTerms, signature);
    await lending.connect(user).initiateLoan(loanTerms, signature);

    return loanId;
  }

  before("Deploy", async function () {
    [admin, alice, bob, treasury, signer, spiceAdmin] =
      await ethers.getSigners();
    await impersonateAccount(constants.accounts.Whale);
    whale = await ethers.getSigner(constants.accounts.Whale);
    await impersonateAccount(constants.accounts.Dev);
    await setBalance(
      constants.accounts.Dev,
      ethers.utils.parseEther("1000").toHexString()
    );
    dev = await ethers.getSigner(constants.accounts.Dev);

    nft2 = await deployNFT();

    weth = await ethers.getContractAt("IWETH", constants.tokens.WETH, admin);

    await weth
      .connect(whale)
      .transfer(signer.address, ethers.utils.parseEther("100"));

    const Vault = await ethers.getContractFactory("Vault");
    let beacon = await upgrades.deployBeacon(Vault);

    vault = await upgrades.deployBeaconProxy(beacon, Vault, [
      "Spice Vault Test Token",
      "svTT",
      weth.address,
      [],
      admin.address,
      constants.accounts.Dev,
      constants.accounts.Multisig,
      treasury.address,
    ]);

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

    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceLending, [
        ethers.constants.AddressZero,
        lenderNote.address,
        borrowerNote.address,
        500,
        8000,
        1000,
        6000,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(SpiceLending, "InvalidAddress");

    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceLending, [
        signer.address,
        ethers.constants.AddressZero,
        borrowerNote.address,
        500,
        8000,
        1000,
        6000,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(SpiceLending, "InvalidAddress");

    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceLending, [
        signer.address,
        lenderNote.address,
        ethers.constants.AddressZero,
        500,
        8000,
        1000,
        6000,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(SpiceLending, "InvalidAddress");

    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceLending, [
        signer.address,
        lenderNote.address,
        borrowerNote.address,
        10001,
        8000,
        1000,
        6000,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(SpiceLending, "ParameterOutOfBounds");

    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceLending, [
        signer.address,
        lenderNote.address,
        borrowerNote.address,
        500,
        10001,
        1000,
        6000,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(SpiceLending, "ParameterOutOfBounds");

    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceLending, [
        signer.address,
        lenderNote.address,
        borrowerNote.address,
        500,
        8000,
        10001,
        6000,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(SpiceLending, "ParameterOutOfBounds");

    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceLending, [
        signer.address,
        lenderNote.address,
        borrowerNote.address,
        500,
        8000,
        1000,
        10001,
        treasury.address,
      ])
    ).to.be.revertedWithCustomError(SpiceLending, "ParameterOutOfBounds");

    await expect(
      upgrades.deployBeaconProxy(beacon, SpiceLending, [
        signer.address,
        lenderNote.address,
        borrowerNote.address,
        500,
        8000,
        1000,
        6000,
        ethers.constants.AddressZero,
      ])
    ).to.be.revertedWithCustomError(SpiceLending, "InvalidAddress");

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

    defaultAdminRole = await lending.DEFAULT_ADMIN_ROLE();
    spiceRole = await lending.SPICE_ROLE();
    signerRole = await lending.SIGNER_ROLE();
    spiceNftRole = await lending.SPICE_NFT_ROLE();

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

    nft1 = await upgrades.deployBeaconProxy(beacon, SpiceFiNFT4626, [
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

    await lending.connect(admin).grantRole(spiceRole, spiceAdmin.address);
    await lending.connect(admin).grantRole(spiceNftRole, nft.address);

    await lenderNote.initialize(lending.address, true);
    await borrowerNote.initialize(lending.address, false);

    const adminRole = await lenderNote.ADMIN_ROLE();
    await checkRole(lenderNote, lending.address, adminRole, true);
    await checkRole(borrowerNote, lending.address, adminRole, true);

    await nft.connect(dev).grantRole(spiceRole, spiceAdmin.address);

    await vault.connect(dev).grantRole(defaultAdminRole, alice.address);

    const amount = ethers.utils.parseEther("100");
    await weth
      .connect(whale)
      .transfer(alice.address, amount.add(ethers.utils.parseEther("0.08")));
    await weth.connect(alice).approve(nft.address, ethers.constants.MaxUint256);
    await nft.connect(alice)["deposit(uint256,uint256)"](0, amount);

    await weth
      .connect(whale)
      .transfer(bob.address, amount.add(ethers.utils.parseEther("0.08")));
    await weth.connect(bob).approve(nft.address, ethers.constants.MaxUint256);
    await nft.connect(bob)["deposit(uint256,uint256)"](0, amount);

    await nft.connect(dev).setBaseURI("uri://");
    await nft.connect(dev).setWithdrawable(true);
  });

  beforeEach(async () => {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  describe("Deployment", function () {
    it("Should set the correct signer", async function () {
      await checkRole(lending, signer.address, signerRole, true);
    });

    it("Should set the correct notes", async function () {
      expect(await lending.lenderNote()).to.equal(lenderNote.address);
      expect(await lending.borrowerNote()).to.equal(borrowerNote.address);
    });

    it("Should set the correct interest fee", async function () {
      expect(await lending.interestFee()).to.equal(500);
    });

    it("Should set the correct liquidation ratio", async function () {
      expect(await lending.liquidationRatio()).to.equal(8000);
    });

    it("Should set the correct loan ratio", async function () {
      expect(await lending.loanRatio()).to.equal(6000);
    });

    it("Should initialize once", async function () {
      await expect(
        lending.initialize(
          signer.address,
          lenderNote.address,
          borrowerNote.address,
          500,
          8000,
          1000,
          6000,
          treasury.address
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("Setters", function () {
    describe("Set Liquidation Fee Ratio", function () {
      it("Only admin call call", async function () {
        await expect(
          lending.connect(alice).setLiquidationFeeRatio(1500)
        ).to.be.revertedWith(
          `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
        );
      });

      it("Should not set bigger than DENOMINATOR", async function () {
        await expect(
          lending.connect(admin).setLiquidationFeeRatio(10001)
        ).to.be.revertedWithCustomError(lending, "ParameterOutOfBounds");
      });

      it("Should set new loan ratio", async function () {
        await lending.connect(admin).setLiquidationFeeRatio(1500);
        expect(await lending.liquidationFeeRatio()).to.equal(1500);
      });
    });

    describe("Set Loan Ratio", function () {
      it("Only admin call call", async function () {
        await expect(
          lending.connect(alice).setLoanRatio(5000)
        ).to.be.revertedWith(
          `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
        );
      });

      it("Should not set bigger than DENOMINATOR", async function () {
        await expect(
          lending.connect(admin).setLoanRatio(10001)
        ).to.be.revertedWithCustomError(lending, "ParameterOutOfBounds");
      });

      it("Should set new loan ratio", async function () {
        await lending.connect(admin).setLoanRatio(5000);
        expect(await lending.loanRatio()).to.equal(5000);
      });
    });

    describe("Set Interest Fee", function () {
      it("Only admin call call", async function () {
        await expect(
          lending.connect(alice).setInterestFee(1000)
        ).to.be.revertedWith(
          `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
        );
      });

      it("Should not set bigger than DENOMINATOR", async function () {
        await expect(
          lending.connect(admin).setInterestFee(10001)
        ).to.be.revertedWithCustomError(lending, "ParameterOutOfBounds");
      });

      it("Should set new interest fee", async function () {
        const tx = await lending.connect(admin).setInterestFee(1000);
        expect(await lending.interestFee()).to.equal(1000);
        await expect(tx).to.emit(lending, "InterestFeeUpdated").withArgs(1000);
      });
    });

    describe("Set Liquidation Ratio", function () {
      it("Only admin call call", async function () {
        await expect(
          lending.connect(alice).setLiquidationRatio(7000)
        ).to.be.revertedWith(
          `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
        );
      });

      it("Should not set bigger than DENOMINATOR", async function () {
        await expect(
          lending.connect(admin).setLiquidationRatio(10001)
        ).to.be.revertedWithCustomError(lending, "ParameterOutOfBounds");
      });

      it("Should set new liquidation ratio", async function () {
        const tx = await lending.connect(admin).setLiquidationRatio(7000);
        expect(await lending.liquidationRatio()).to.equal(7000);
        await expect(tx)
          .to.emit(lending, "LiquidationRatioUpdated")
          .withArgs(7000);
      });
    });
  });

  describe("Initiate Loan", function () {
    let loanTerms;

    beforeEach(function () {
      loanTerms = {
        lender: signer.address,
        loanAmount: ethers.utils.parseEther("10"),
        interestRate: 500,
        duration: 10 * 24 * 3600, // 10 days
        collateralAddress: nft.address,
        collateralId: 1,
        borrower: alice.address,
        expiration: Math.floor(Date.now() / 1000) + 30 * 60,
        currency: weth.address,
        priceLiquidation: false,
      };
    });

    it("When loan terms expired", async function () {
      loanTerms.expiration = Math.floor(Date.now() / 1000) - 10 * 60;
      const signature = await signLoanTerms(signer, lending.address, loanTerms);
      await expect(
        lending.connect(alice).initiateLoan(loanTerms, signature)
      ).to.be.revertedWithCustomError(lending, "LoanTermsExpired");
    });

    it("When caller is not borrower", async function () {
      await expect(
        lending.connect(bob).initiateLoan(loanTerms, "0x")
      ).to.be.revertedWithCustomError(lending, "InvalidMsgSender");
    });

    it("When loan amount exceeds limit", async function () {
      loanTerms.loanAmount = ethers.utils.parseEther("60").add(1);
      const signature = await signLoanTerms(signer, lending.address, loanTerms);
      await expect(
        lending.connect(alice).initiateLoan(loanTerms, signature)
      ).to.be.revertedWithCustomError(lending, "LoanAmountExceeded");
    });

    it("When signature is invalid #1", async function () {
      const signature = INVALID_SIGNATURE1;
      await expect(
        lending.connect(alice).initiateLoan(loanTerms, signature)
      ).to.be.revertedWith("ECDSA: invalid signature length");
    });

    it("When signature is invalid #2", async function () {
      const signature = INVALID_SIGNATURE2;
      await expect(
        lending.connect(alice).initiateLoan(loanTerms, signature)
      ).to.be.revertedWith("ECDSA: invalid signature 'v' value");
    });

    it("When signature is invalid #3", async function () {
      const signature = await signLoanTerms(bob, lending.address, loanTerms);
      await expect(
        lending.connect(alice).initiateLoan(loanTerms, signature)
      ).to.be.revertedWithCustomError(lending, "SignerNotEnabled");
    });

    it("When borrower does not own collateral", async function () {
      loanTerms.borrower = bob.address;
      const signature = await signLoanTerms(signer, lending.address, loanTerms);
      await expect(
        lending.connect(bob).initiateLoan(loanTerms, signature)
      ).to.be.revertedWith("ERC721: caller is not token owner or approved");
    });

    it("When collateral is not approved", async function () {
      const signature = await signLoanTerms(signer, lending.address, loanTerms);
      await expect(
        lending.connect(alice).initiateLoan(loanTerms, signature)
      ).to.be.revertedWith("ERC721: caller is not token owner or approved");
    });

    it("When principal is not approved", async function () {
      await nft.connect(alice).setApprovalForAll(lending.address, true);
      const signature = await signLoanTerms(signer, lending.address, loanTerms);
      await expect(
        lending.connect(alice).initiateLoan(loanTerms, signature)
      ).to.be.revertedWith("SafeERC20: low-level call failed");
    });

    it("When principal balance is not enough", async function () {
      await nft.connect(alice).setApprovalForAll(lending.address, true);
      await weth
        .connect(signer)
        .approve(lending.address, ethers.constants.MaxUint256);
      const principalBalance = await weth.balanceOf(signer.address);
      await weth
        .connect(signer)
        .transfer(
          bob.address,
          principalBalance.sub(ethers.utils.parseEther("5"))
        );

      const signature = await signLoanTerms(signer, lending.address, loanTerms);
      await expect(
        lending.connect(alice).initiateLoan(loanTerms, signature)
      ).to.be.revertedWith("SafeERC20: low-level call failed");
    });

    it("Initiates a new loan and transfer tokens", async function () {
      let loanIds = await lending.getActiveLoans(alice.address);
      expect(loanIds.length).to.be.eq(0);

      await nft.connect(alice).setApprovalForAll(lending.address, true);
      await weth
        .connect(signer)
        .approve(lending.address, ethers.constants.MaxUint256);
      const signature = await signLoanTerms(signer, lending.address, loanTerms);
      const loanId = await lending
        .connect(alice)
        .callStatic.initiateLoan(loanTerms, signature);
      const tx = await lending
        .connect(alice)
        .initiateLoan(loanTerms, signature);

      await expect(tx)
        .to.emit(lending, "LoanStarted")
        .withArgs(loanId, alice.address);

      loanIds = await lending.getActiveLoans(alice.address);
      expect(loanIds.length).to.be.eq(1);
      expect(loanIds[0]).to.be.eq(loanId);

      expect(await lenderNote.ownerOf(loanId)).to.be.eq(signer.address);
      expect(await borrowerNote.ownerOf(loanId)).to.be.eq(alice.address);
      expect(await nft.tokenShares(loanTerms.collateralId)).to.be.eq(
        loanTerms.loanAmount.add(ethers.utils.parseEther("100"))
      );
      expect(await nft.ownerOf(1)).to.be.eq(lending.address);

      const loanData = await lending.getLoanData(loanId);
      expect(loanData.state).to.be.eq(1);
      expect(loanData.balance).to.be.eq(loanTerms.loanAmount);
      expect(loanData.interestAccrued).to.be.eq(0);
      expect(loanData.startedAt).to.be.eq(loanData.updatedAt);

      expect(await lending.getNextLoanId()).to.be.eq(loanId.add(1));
    });

    it("Signature replay attack", async function () {
      await nft.connect(alice).setApprovalForAll(lending.address, true);
      await weth
        .connect(signer)
        .approve(lending.address, ethers.constants.MaxUint256);
      const signature = await signLoanTerms(signer, lending.address, loanTerms);
      await lending.connect(alice).initiateLoan(loanTerms, signature);
      await expect(lending.connect(alice).initiateLoan(loanTerms, signature))
        .to.be.revertedWithCustomError(lending, "SignatureUsed")
        .withArgs(signature);
    });
  });

  describe("Update Loan", function () {
    let loanId;
    let terms;

    beforeEach(async function () {
      loanId = await initiateTestLoan(alice, 1, false);

      terms = {
        lender: signer.address,
        loanAmount: ethers.utils.parseEther("12"),
        interestRate: 550,
        duration: 12 * 24 * 3600, // 12 days
        collateralAddress: nft.address,
        collateralId: 1,
        borrower: alice.address,
        expiration: Math.floor(Date.now() / 1000) + 30 * 60,
        currency: weth.address,
        priceLiquidation: false,
      };

      await weth
        .connect(whale)
        .transfer(alice.address, ethers.utils.parseEther("100"));

      const amount = ethers.utils.parseEther("100");
      await weth
        .connect(whale)
        .transfer(alice.address, amount.add(ethers.utils.parseEther("0.08")));
      await weth
        .connect(alice)
        .approve(nft1.address, ethers.constants.MaxUint256);
      await nft1.connect(alice)["deposit(uint256,uint256)"](0, amount);
    });

    it("When loan does not exist", async function () {
      await expect(lending.connect(alice).updateLoan(loanId + 1, terms, "0x"))
        .to.be.revertedWithCustomError(lending, "InvalidState")
        .withArgs(0);
    });

    it("When loan is not active", async function () {
      await weth
        .connect(alice)
        .approve(lending.address, ethers.constants.MaxUint256);
      await lending.connect(alice).repay(loanId);

      await expect(lending.connect(alice).updateLoan(loanId, terms, "0x"))
        .to.be.revertedWithCustomError(lending, "InvalidState")
        .withArgs(2);
    });

    it("When caller is not borrower", async function () {
      await expect(
        lending.connect(bob).updateLoan(loanId, terms, "0x")
      ).to.be.revertedWithCustomError(lending, "InvalidMsgSender");
    });

    it("When loan terms expired", async function () {
      terms.expiration = Math.floor(Date.now() / 1000) - 10 * 60;
      const signature = await signLoanTerms(signer, lending.address, terms);
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWithCustomError(lending, "LoanTermsExpired");
    });

    it("When loan amount exceeds limit", async function () {
      const collateral = await nft.tokenShares(1);
      terms.loanAmount = collateral.mul(6000).div(10000).add(1);
      const signature = await signLoanTerms(signer, lending.address, terms);
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWithCustomError(lending, "LoanAmountExceeded");
    });

    it("When loan terms is invalid #1", async function () {
      terms.collateralAddress = nft1.address;
      const signature = await signLoanTerms(signer, lending.address, terms);
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWithCustomError(lending, "InvalidLoanTerms");
    });

    it("When loan terms is invalid #2", async function () {
      terms.loanAmount = ethers.utils.parseEther("10");
      const signature = await signLoanTerms(signer, lending.address, terms);
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWithCustomError(lending, "InvalidLoanTerms");
    });

    it("When loan terms is invalid #3", async function () {
      terms.currency = bob.address;
      const signature = await signLoanTerms(signer, lending.address, terms);
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWithCustomError(lending, "InvalidLoanTerms");
    });

    it("When loan terms is invalid #4", async function () {
      terms.priceLiquidation = !terms.priceLiquidation;
      const signature = await signLoanTerms(signer, lending.address, terms);
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWithCustomError(lending, "InvalidLoanTerms");
    });

    it("When signature is invalid #1", async function () {
      const signature = INVALID_SIGNATURE1;
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWith("ECDSA: invalid signature length");
    });

    it("When signature is invalid #2", async function () {
      const signature = INVALID_SIGNATURE2;
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWith("ECDSA: invalid signature 'v' value");
    });

    it("When signature is invalid #3", async function () {
      const signature = await signLoanTerms(bob, lending.address, terms);
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWithCustomError(lending, "SignerNotEnabled");
    });

    it("When currency is not approved", async function () {
      await weth.connect(signer).approve(lending.address, 0);
      const signature = await signLoanTerms(signer, lending.address, terms);
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWith("SafeERC20: low-level call failed");
    });

    it("When currency balance is not enough", async function () {
      const balance = await weth.balanceOf(signer.address);
      await weth.connect(signer).transfer(bob.address, balance);
      const signature = await signLoanTerms(signer, lending.address, terms);
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWith("SafeERC20: low-level call failed");
    });

    it("Invalid msg sender #1", async function () {
      await weth
        .connect(signer)
        .approve(lending.address, ethers.constants.MaxUint256);
      terms.lender = bob.address;
      const signature = await signLoanTerms(bob, lending.address, terms);
      await lending.connect(admin).grantRole(signerRole, bob.address);
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWithCustomError(lending, "InvalidMsgSender");
    });

    it("Invalid loan terms #2", async function () {
      await weth
        .connect(signer)
        .approve(lending.address, ethers.constants.MaxUint256);
      terms.collateralId = 2;
      const signature = await signLoanTerms(bob, lending.address, terms);
      await lending.connect(admin).grantRole(signerRole, bob.address);
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWithCustomError(lending, "InvalidLoanTerms");
    });

    it("Invalid loan terms #3", async function () {
      await weth
        .connect(signer)
        .approve(lending.address, ethers.constants.MaxUint256);
      terms.borrower = bob.address;
      const signature = await signLoanTerms(bob, lending.address, terms);
      await lending.connect(admin).grantRole(signerRole, bob.address);
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWithCustomError(lending, "InvalidLoanTerms");
    });

    it("When magicValue is not returned", async function () {
      // deposit to vault
      await weth
        .connect(whale)
        .approve(vault.address, ethers.constants.MaxUint256);
      const assets = ethers.utils.parseEther("100");
      await vault.connect(whale).deposit(assets, whale.address);

      // approve asset to lending contract
      const marketplacerole = await vault.MARKETPLACE_ROLE();
      await vault.connect(alice).grantRole(marketplacerole, lending.address);
      await vault.connect(alice).approveAsset(lending.address, assets);

      // revoke default_admin_role from alice
      await vault.connect(dev).revokeRole(defaultAdminRole, alice.address);

      await lenderNote
        .connect(signer)
        ["safeTransferFrom(address,address,uint256)"](
          signer.address,
          vault.address,
          loanId
        );
      terms.lender = vault.address;
      const signature = await signLoanTerms(alice, lending.address, terms);
      await lending.connect(admin).grantRole(signerRole, alice.address);
      await expect(
        lending.connect(alice).updateLoan(loanId, terms, signature)
      ).to.be.revertedWithCustomError(lending, "InvalidSigner");
    });

    it("When magicValue is returned", async function () {
      await increaseTime(5 * 24 * 3600);

      // deposit to vault
      await weth
        .connect(whale)
        .approve(vault.address, ethers.constants.MaxUint256);
      const assets = ethers.utils.parseEther("100");
      await vault.connect(whale).deposit(assets, whale.address);

      // approve asset to lending contract
      const marketplacerole = await vault.MARKETPLACE_ROLE();
      await vault.connect(alice).grantRole(marketplacerole, lending.address);
      await vault.connect(alice).approveAsset(lending.address, assets);

      await lenderNote
        .connect(signer)
        ["safeTransferFrom(address,address,uint256)"](
          signer.address,
          vault.address,
          loanId
        );
      terms.lender = vault.address;
      terms.expiration = terms.expiration + 5 * 24 * 3600;
      const signature = await signLoanTerms(alice, lending.address, terms);
      await lending.connect(admin).grantRole(signerRole, alice.address);
      const interestAccrued = ethers.utils
        .parseEther("10")
        .mul(terms.interestRate * 5)
        .div(10000 * 365);
      const tx = await lending
        .connect(alice)
        .updateLoan(loanId, terms, signature);
      await expect(tx).to.emit(lending, "LoanUpdated").withArgs(loanId);
      expect(await nft.tokenShares(terms.collateralId)).to.be.closeTo(
        terms.loanAmount
          .sub(interestAccrued)
          .add(ethers.utils.parseEther("100")),
        interestAccrued.div(10)
      );
      const newLoanData = await lending.getLoanData(loanId);
      expect(newLoanData.balance).to.be.eq(terms.loanAmount);
      expect(newLoanData.terms.loanAmount).to.be.eq(terms.loanAmount);
      expect(newLoanData.terms.duration).to.be.eq(terms.duration);
      expect(newLoanData.terms.interestRate).to.be.eq(terms.interestRate);
    });

    it("Extends loan and transfer additional principal", async function () {
      await increaseTime(5 * 24 * 3600);

      await weth
        .connect(signer)
        .transfer(bob.address, ethers.utils.parseEther("5"));
      await weth
        .connect(bob)
        .approve(lending.address, ethers.constants.MaxUint256);
      await lenderNote
        .connect(signer)
        ["safeTransferFrom(address,address,uint256)"](
          signer.address,
          bob.address,
          loanId
        );
      terms.lender = bob.address;
      terms.expiration = terms.expiration + 5 * 24 * 3600;
      const signature = await signLoanTerms(bob, lending.address, terms);
      await lending.connect(admin).grantRole(signerRole, bob.address);
      const interestAccrued = ethers.utils
        .parseEther("10")
        .mul(terms.interestRate * 5)
        .div(10000 * 365);
      const tx = await lending
        .connect(alice)
        .updateLoan(loanId, terms, signature);
      await expect(tx).to.emit(lending, "LoanUpdated").withArgs(loanId);
      expect(await nft.tokenShares(terms.collateralId)).to.be.closeTo(
        terms.loanAmount
          .sub(interestAccrued)
          .add(ethers.utils.parseEther("100")),
        interestAccrued.div(10)
      );
      const newLoanData = await lending.getLoanData(loanId);
      expect(newLoanData.balance).to.be.eq(terms.loanAmount);
      expect(newLoanData.terms.loanAmount).to.be.eq(terms.loanAmount);
      expect(newLoanData.terms.duration).to.be.eq(terms.duration);
      expect(newLoanData.terms.interestRate).to.be.eq(terms.interestRate);
    });

    it("Signature replay attack", async function () {
      await weth
        .connect(signer)
        .approve(lending.address, ethers.constants.MaxUint256);
      const signature = await signLoanTerms(signer, lending.address, terms);
      await lending.connect(alice).updateLoan(loanId, terms, signature);
      await expect(lending.connect(alice).updateLoan(loanId, terms, signature))
        .to.be.revertedWithCustomError(lending, "SignatureUsed")
        .withArgs(signature);
    });
  });

  describe("Partial Repay", function () {
    let loanId1, loanId2;

    beforeEach(async function () {
      loanId1 = await initiateTestLoan(alice, 1, false);
      loanId2 = await initiateTestLoan(bob, 2, true);
    });

    it("When loan does not exist", async function () {
      const payment = ethers.utils.parseEther("5");
      await expect(lending.connect(alice).partialRepay(100, payment))
        .to.be.revertedWithCustomError(lending, "InvalidState")
        .withArgs(0);
    });

    it("When loan is not active", async function () {
      await weth
        .connect(alice)
        .approve(lending.address, ethers.constants.MaxUint256);
      await lending.connect(alice).repay(loanId1);

      const payment = ethers.utils.parseEther("5");
      await expect(lending.connect(alice).partialRepay(loanId1, payment))
        .to.be.revertedWithCustomError(lending, "InvalidState")
        .withArgs(2);
    });

    it("When caller is not borrower", async function () {
      const payment = ethers.utils.parseEther("5");
      await expect(
        lending.connect(bob).partialRepay(loanId1, payment)
      ).to.be.revertedWithCustomError(lending, "InvalidMsgSender");
    });

    it("When partially repaying for Spice NFT loan", async function () {
      await increaseTime(24 * 3600);

      await weth
        .connect(bob)
        .approve(lending.address, ethers.constants.MaxUint256);

      const beforeBalance = await weth.balanceOf(bob.address);
      let shares = await nft.tokenShares(2);
      const beforeWithdrawable = await nft.previewRedeem(shares);

      const payment = ethers.utils.parseEther("5");
      const tx = await lending.connect(bob).partialRepay(loanId2, payment);

      await expect(tx).to.emit(lending, "LoanRepaid").withArgs(loanId2);
      expect(await weth.balanceOf(bob.address)).to.be.eq(beforeBalance);
      expect(await weth.balanceOf(treasury.address)).to.be.gt(0);

      shares = await nft.tokenShares(2);
      const afterWithdrawable = await nft.previewRedeem(shares);
      expect(beforeWithdrawable).to.be.eq(afterWithdrawable.add(payment));
    });

    it("When repaying very small payment", async function () {
      await increaseTime(24 * 3600);

      await weth
        .connect(alice)
        .approve(lending.address, ethers.constants.MaxUint256);

      const beforeBalance = await nft.tokenShares(1);

      const payment = 10000;
      const tx = await lending.connect(alice).partialRepay(loanId1, payment);

      await expect(tx).to.emit(lending, "LoanRepaid").withArgs(loanId1);
      expect(await nft.tokenShares(1)).to.be.eq(beforeBalance.sub(payment));
      expect(await weth.balanceOf(treasury.address)).to.be.gt(0);
    });

    it("When repaying full payment", async function () {
      await increaseTime(24 * 3600);

      await weth
        .connect(alice)
        .approve(lending.address, ethers.constants.MaxUint256);

      const beforeBalance = await nft.tokenShares(1);

      const payment = ethers.utils.parseEther("11");
      const tx = await lending.connect(alice).partialRepay(loanId1, payment);

      await expect(tx).to.emit(lending, "LoanRepaid").withArgs(loanId1);
      expect(await nft.tokenShares(1)).to.be.gt(beforeBalance.sub(payment));
      expect(await weth.balanceOf(treasury.address)).to.be.gt(0);

      const loanData = await lending.getLoanData(loanId1);
      expect(loanData.state).to.be.eq(2);
      expect(loanData.interestAccrued).to.be.eq(0);

      expect(await nft.ownerOf(1)).to.be.eq(alice.address);
      await expect(lenderNote.ownerOf(loanId1)).to.be.revertedWith(
        "ERC721: invalid token ID"
      );
      await expect(borrowerNote.ownerOf(loanId1)).to.be.revertedWith(
        "ERC721: invalid token ID"
      );
    });
  });

  describe("Repay", function () {
    let loanId1, loanId2;

    beforeEach(async function () {
      loanId1 = await initiateTestLoan(alice, 1, false);
      loanId2 = await initiateTestLoan(bob, 2, true);
    });

    it("When loan does not exist", async function () {
      await expect(lending.connect(alice).repay(100))
        .to.be.revertedWithCustomError(lending, "InvalidState")
        .withArgs(0);
    });

    it("When loan is not active", async function () {
      await weth
        .connect(alice)
        .approve(lending.address, ethers.constants.MaxUint256);
      await lending.connect(alice).repay(loanId1);

      await expect(lending.connect(alice).repay(loanId1))
        .to.be.revertedWithCustomError(lending, "InvalidState")
        .withArgs(2);
    });

    it("When caller is not borrower", async function () {
      await expect(
        lending.connect(bob).repay(loanId1)
      ).to.be.revertedWithCustomError(lending, "InvalidMsgSender");
    });

    it("When repaying for loan", async function () {
      await increaseTime(24 * 3600);

      await weth
        .connect(alice)
        .approve(lending.address, ethers.constants.MaxUint256);

      const shares = await nft.tokenShares(1);

      const tx = await lending.connect(alice).repay(loanId1);

      await expect(tx).to.emit(lending, "LoanRepaid").withArgs(loanId1);
      expect(await nft.tokenShares(1)).to.be.lt(shares);
      expect(await weth.balanceOf(treasury.address)).to.be.gt(0);
    });

    it("Should burn notes and transfer collateral", async function () {
      await increaseTime(24 * 3600);

      await weth
        .connect(alice)
        .approve(lending.address, ethers.constants.MaxUint256);

      await lending.connect(alice).repay(loanId1);

      const loanData = await lending.getLoanData(loanId1);
      expect(loanData.state).to.be.eq(2);
      expect(loanData.interestAccrued).to.be.eq(0);

      expect(await nft.ownerOf(1)).to.be.eq(alice.address);
      await expect(lenderNote.ownerOf(loanId1)).to.be.revertedWith(
        "ERC721: invalid token ID"
      );
      await expect(borrowerNote.ownerOf(loanId1)).to.be.revertedWith(
        "ERC721: invalid token ID"
      );

      let loanIds = await lending.getActiveLoans(alice.address);
      expect(loanIds.length).to.be.eq(0);
    });
  });

  describe("Liquidate", function () {
    let loanId1, loanId2;

    beforeEach(async function () {
      loanId1 = await initiateTestLoan(alice, 1, true);
      loanId2 = await initiateTestLoan(bob, 2, false);
    });

    it("When loan does not exist", async function () {
      await expect(lending.connect(bob).liquidate(1000))
        .to.be.revertedWithCustomError(lending, "InvalidState")
        .withArgs(0);
    });

    it("When loan is not active", async function () {
      await weth
        .connect(alice)
        .approve(lending.address, ethers.constants.MaxUint256);
      await lending.connect(alice).repay(loanId1);

      await expect(lending.connect(bob).liquidate(loanId1))
        .to.be.revertedWithCustomError(lending, "InvalidState")
        .withArgs(2);
    });

    it("When loan is not ended", async function () {
      await increaseTime(24 * 3600);

      await expect(
        lending.connect(bob).liquidate(loanId1)
      ).to.be.revertedWithCustomError(lending, "NotLiquidatible");
    });

    it("When liquidation limit is not reached", async function () {
      await increaseTime(24 * 3600);

      await expect(
        lending.connect(bob).liquidate(loanId2)
      ).to.be.revertedWithCustomError(lending, "NotLiquidatible");
    });

    it("Liquidate NFT loan (price)", async function () {
      await increaseTime(10 * 24 * 3600);

      await lending.connect(admin).setLiquidationRatio(10);

      const tx = await lending.connect(bob).liquidate(loanId1);

      await expect(tx).to.emit(lending, "LoanLiquidated").withArgs(loanId1);

      const loanData = await lending.getLoanData(loanId1);
      expect(loanData.state).to.be.eq(3);

      expect(await nft.ownerOf(1)).to.be.eq(alice.address);
      await expect(lenderNote.ownerOf(loanId1)).to.be.revertedWith(
        "ERC721: invalid token ID"
      );
      await expect(borrowerNote.ownerOf(loanId1)).to.be.revertedWith(
        "ERC721: invalid token ID"
      );
    });

    it("Liquidate NFT loan (price but expired)", async function () {
      await increaseTime(6 * 24 * 3600);

      await expect(
        lending.connect(bob).liquidate(loanId1)
      ).to.be.revertedWithCustomError(lending, "NotLiquidatible");

      await increaseTime(6 * 24 * 3600);

      const tx = await lending.connect(bob).liquidate(loanId1);

      await expect(tx).to.emit(lending, "LoanLiquidated").withArgs(loanId1);

      const loanData = await lending.getLoanData(loanId1);
      expect(loanData.state).to.be.eq(3);

      expect(await nft.ownerOf(1)).to.be.eq(alice.address);
      await expect(lenderNote.ownerOf(loanId1)).to.be.revertedWith(
        "ERC721: invalid token ID"
      );
      await expect(borrowerNote.ownerOf(loanId1)).to.be.revertedWith(
        "ERC721: invalid token ID"
      );

      let loanIds = await lending.getActiveLoans(alice.address);
      expect(loanIds.length).to.be.eq(0);
    });

    it("Liquidate NFT loan (time)", async function () {
      await increaseTime(12 * 24 * 3600);

      const tx = await lending.connect(alice).liquidate(loanId2);

      await expect(tx).to.emit(lending, "LoanLiquidated").withArgs(loanId2);

      const loanData = await lending.getLoanData(loanId2);
      expect(loanData.state).to.be.eq(3);

      expect(await nft.ownerOf(2)).to.be.eq(bob.address);
      await expect(lenderNote.ownerOf(loanId2)).to.be.revertedWith(
        "ERC721: invalid token ID"
      );
      await expect(borrowerNote.ownerOf(loanId2)).to.be.revertedWith(
        "ERC721: invalid token ID"
      );

      let loanIds = await lending.getActiveLoans(bob.address);
      expect(loanIds.length).to.be.eq(0);
    });
  });

  describe("Repay Amount", function () {
    let loanId;

    beforeEach(async function () {
      loanId = await initiateTestLoan(alice, 1, false);
    });

    it("When loan does not exist", async function () {
      await expect(lending.repayAmount(100))
        .to.be.revertedWithCustomError(lending, "InvalidState")
        .withArgs(0);
    });

    it("When loan is not active", async function () {
      await weth
        .connect(alice)
        .approve(lending.address, ethers.constants.MaxUint256);
      await lending.connect(alice).repay(loanId);

      await expect(lending.repayAmount(loanId))
        .to.be.revertedWithCustomError(lending, "InvalidState")
        .withArgs(2);
    });

    it("When loan is not expired", async function () {
      await increaseTime(5 * 24 * 3600);

      const loanAmount = ethers.utils.parseEther("10");
      const interest = loanAmount.mul(500).mul(5).div(10000).div(365);
      const repayAmount = loanAmount.add(interest);
      expect(await lending.repayAmount(loanId)).to.be.closeTo(repayAmount, 100);
    });

    it("When loan is expired", async function () {
      await increaseTime(10 * 24 * 3600);

      const loanAmount = ethers.utils.parseEther("10");
      const interest = loanAmount.mul(500).mul(10).div(10000).div(365);
      const repayAmount = loanAmount.add(interest);
      expect(await lending.repayAmount(loanId)).to.be.eq(repayAmount);
    });
  });

  describe("Deposit", function () {
    let loanId;

    beforeEach(async function () {
      loanId = await initiateTestLoan(alice, 1, false);
    });

    it("When asset is not approved", async function () {
      await weth.connect(alice).approve(lending.address, 0);
      await expect(
        lending.connect(alice).deposit(loanId, ethers.utils.parseEther("1"))
      ).to.be.revertedWith("SafeERC20: low-level call failed");
    });

    it("When asset balance is not enough", async function () {
      await weth
        .connect(alice)
        .approve(lending.address, ethers.constants.MaxUint256);
      const balance = await weth.balanceOf(alice.address);
      await expect(
        lending.connect(alice).deposit(loanId, balance.add(1))
      ).to.be.revertedWith("SafeERC20: low-level call failed");
    });

    it("When deposit 0 amount", async function () {
      await expect(
        lending.connect(alice).callStatic.deposit(loanId, 0)
      ).to.be.revertedWithCustomError(nft, "ParameterOutOfBounds");
    });

    it("Make additional deposit", async function () {
      await weth
        .connect(alice)
        .approve(lending.address, ethers.constants.MaxUint256);

      const beforeShares = await nft.tokenShares(1);
      const amount = ethers.utils.parseEther("1");
      await weth.connect(whale).transfer(alice.address, amount);
      const shares = await lending
        .connect(alice)
        .callStatic.deposit(loanId, amount);
      await lending.connect(alice).deposit(loanId, amount);

      const afterShares = await nft.tokenShares(1);
      expect(shares).to.be.eq(amount);
      expect(afterShares).to.be.eq(beforeShares.add(shares));
    });
  });

  describe("Withdraw", function () {
    let loanId;

    beforeEach(async function () {
      loanId = await initiateTestLoan(alice, 1, false);
    });

    it("When caller is not borrower", async function () {
      const amount = ethers.utils.parseEther("1");
      await expect(
        lending.connect(bob).withdraw(loanId, amount)
      ).to.be.revertedWithCustomError(lending, "InvalidMsgSender");
    });

    it("When withdraw too much", async function () {
      const amount = ethers.utils.parseEther("85");
      await expect(
        lending.connect(alice).withdraw(loanId, amount)
      ).to.be.revertedWithCustomError(lending, "LoanAmountExceeded");
    });

    it("Withdraw from NFT vault", async function () {
      const beforeShares = await nft.tokenShares(1);
      const beforeBalance = await weth.balanceOf(alice.address);
      const amount = ethers.utils.parseEther("1");
      const shares = await lending
        .connect(alice)
        .callStatic.withdraw(loanId, amount);
      await lending.connect(alice).withdraw(loanId, amount);

      const afterShares = await nft.tokenShares(1);
      const afterBalance = await weth.balanceOf(alice.address);
      expect(shares).to.be.eq(amount);
      expect(beforeShares).to.be.eq(afterShares.add(shares));
      expect(afterBalance).to.be.eq(beforeBalance.add(amount));
    });
  });
});
