const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("../helpers/snapshot");
const constants = require("../constants");

describe("VaultFactory", function () {
  let weth;
  let vault;
  let spiceVault;
  let spiceFiFactory;
  let factory;
  let beacon;

  let admin, alice, marketplace1, marketplace2, treasury;

  let snapshotId;

  let defaultAdminRole, assetRole, vaultRole, aggregatorRole, marketplaceRole;

  const vaultName = "Spice Vault Test Token";
  const vaultSymbol = "svTT";

  async function checkRole(contract, user, role, check) {
    expect(await contract.hasRole(role, user)).to.equal(check);
  }

  before("Deploy", async function () {
    [admin, alice, marketplace1, marketplace2, treasury] =
      await ethers.getSigners();

    weth = await ethers.getContractAt(
      "TestERC20",
      constants.tokens.WETH,
      admin
    );

    const Vault = await ethers.getContractFactory("Vault");
    beacon = await upgrades.deployBeacon(Vault);

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

    const SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626");
    const spiceFiBeacon = await upgrades.deployBeacon(SpiceFi4626, {
      unsafeAllow: ["delegatecall"],
    });

    spiceVault = await upgrades.deployBeaconProxy(spiceFiBeacon, SpiceFi4626, [
      "Spice0",
      "s0",
      constants.tokens.WETH,
      [],
      admin.address,
      constants.accounts.Dev,
      constants.accounts.Multisig,
      treasury.address,
    ]);

    const SpiceFiFactory = await ethers.getContractFactory("SpiceFiFactory");

    spiceFiFactory = await SpiceFiFactory.deploy(
      spiceFiBeacon.address,
      constants.accounts.Dev,
      constants.accounts.Multisig,
      treasury.address
    );

    assetRole = await spiceFiFactory.ASSET_ROLE();
    vaultRole = await spiceFiFactory.VAULT_ROLE();
    aggregatorRole = await spiceFiFactory.AGGREGATOR_ROLE();

    const VaultFactory = await ethers.getContractFactory("VaultFactory");

    await expect(
      VaultFactory.deploy(
        ethers.constants.AddressZero,
        spiceFiFactory.address,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        treasury.address
      )
    ).to.be.revertedWithCustomError(VaultFactory, "InvalidAddress");
    await expect(
      VaultFactory.deploy(
        beacon.address,
        ethers.constants.AddressZero,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        treasury.address
      )
    ).to.be.revertedWithCustomError(VaultFactory, "InvalidAddress");
    await expect(
      VaultFactory.deploy(
        beacon.address,
        spiceFiFactory.address,
        ethers.constants.AddressZero,
        constants.accounts.Multisig,
        treasury.address
      )
    ).to.be.revertedWithCustomError(VaultFactory, "InvalidAddress");
    await expect(
      VaultFactory.deploy(
        beacon.address,
        spiceFiFactory.address,
        constants.accounts.Dev,
        ethers.constants.AddressZero,
        treasury.address
      )
    ).to.be.revertedWithCustomError(VaultFactory, "InvalidAddress");
    await expect(
      VaultFactory.deploy(
        beacon.address,
        spiceFiFactory.address,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        ethers.constants.AddressZero
      )
    ).to.be.revertedWithCustomError(VaultFactory, "InvalidAddress");

    factory = await VaultFactory.deploy(
      beacon.address,
      spiceFiFactory.address,
      constants.accounts.Dev,
      constants.accounts.Multisig,
      treasury.address
    );

    defaultAdminRole = await factory.DEFAULT_ADMIN_ROLE();
    marketplaceRole = await factory.MARKETPLACE_ROLE();
  });

  beforeEach(async () => {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  describe("Create Vault", function () {
    it("When asset is 0x0", async function () {
      await expect(
        factory.connect(alice).createVault(ethers.constants.AddressZero, [])
      ).to.be.revertedWithCustomError(factory, "InvalidAddress");
    });

    it("When missing ASSET_ROLE", async function () {
      await expect(
        factory.connect(alice).createVault(constants.tokens.WETH, [])
      )
        .to.be.revertedWithCustomError(factory, "MissingRole")
        .withArgs(assetRole, constants.tokens.WETH);
    });

    it("When missing MARKETPLACE_ROLE", async function () {
      await spiceFiFactory.grantRole(assetRole, constants.tokens.WETH);
      await expect(
        factory
          .connect(alice)
          .createVault(constants.tokens.WETH, [
            marketplace1.address,
            marketplace2.address,
          ])
      ).to.be.revertedWith(
        `AccessControl: account ${marketplace1.address.toLowerCase()} is missing role ${marketplaceRole}`
      );
    });

    it("Create Vault", async function () {
      await spiceFiFactory.grantRole(assetRole, constants.tokens.WETH);
      await factory.grantRole(marketplaceRole, marketplace1.address);
      await factory.grantRole(marketplaceRole, marketplace2.address);

      const created = await factory
        .connect(alice)
        .callStatic.createVault(constants.tokens.WETH, [
          marketplace1.address,
          marketplace2.address,
        ]);

      const tx = await factory
        .connect(alice)
        .createVault(constants.tokens.WETH, [
          marketplace1.address,
          marketplace2.address,
        ]);

      await expect(tx)
        .to.emit(factory, "VaultCreated")
        .withArgs(alice.address, created);

      const createdVault = await ethers.getContractAt("Vault", created);
      expect(await createdVault.name()).to.be.eq("Spice1Vault");
      expect(await createdVault.symbol()).to.be.eq("s1v");
      await checkRole(
        createdVault,
        marketplace1.address,
        marketplaceRole,
        true
      );
      await checkRole(
        createdVault,
        marketplace2.address,
        marketplaceRole,
        true
      );
      await checkRole(factory, createdVault.address, vaultRole, true);
    });
  });

  describe("Admin Actions", function () {
    it("Set Dev", async function () {
      await expect(
        factory.connect(alice).setDev(treasury.address)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        factory.connect(admin).setDev(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(factory, "InvalidAddress");

      const tx = await factory.connect(admin).setDev(treasury.address);

      await expect(tx)
        .to.emit(factory, "DevUpdated")
        .withArgs(treasury.address);
      expect(await factory.dev()).to.be.eq(treasury.address);
    });

    it("Set Multisig", async function () {
      await expect(
        factory.connect(alice).setMultisig(treasury.address)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        factory.connect(admin).setMultisig(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(factory, "InvalidAddress");

      const tx = await factory.connect(admin).setMultisig(treasury.address);

      await expect(tx)
        .to.emit(factory, "MultisigUpdated")
        .withArgs(treasury.address);
      expect(await factory.multisig()).to.be.eq(treasury.address);
    });

    it("Set Fee Recipient", async function () {
      await expect(
        factory.connect(alice).setFeeRecipient(treasury.address)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        factory.connect(admin).setFeeRecipient(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(factory, "InvalidAddress");

      const tx = await factory.connect(admin).setFeeRecipient(treasury.address);

      await expect(tx)
        .to.emit(factory, "FeeRecipientUpdated")
        .withArgs(treasury.address);
      expect(await factory.feeRecipient()).to.be.eq(treasury.address);
    });
  });
});
