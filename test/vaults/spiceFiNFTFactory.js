const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("../helpers/snapshot");
const constants = require("../constants");

describe("SpiceFiNFTFactory", function () {
  let weth;
  let vault;
  let bend;
  let drops;
  let factory;
  let beacon;

  let admin, alice, bob, treasury;

  let snapshotId;

  let defaultAdminRole, assetRole, vaultRole, aggregatorRole;

  const vaultName = "Spice Vault Test Token";
  const vaultSymbol = "svTT";
  const bendVaultName = "Spice interest bearing WETH";
  const bendVaultSymbol = "spiceETH";
  const dropsVaultName = "Spice CEther";
  const dropsVaultSymbol = "SCEther";

  async function checkRole(contract, user, role, check) {
    expect(await contract.hasRole(role, user)).to.equal(check);
  }

  before("Deploy", async function () {
    [admin, alice, bob, treasury] = await ethers.getSigners();

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

    const SpiceFiNFT4626 = await ethers.getContractFactory("SpiceFiNFT4626");
    beacon = await upgrades.deployBeacon(SpiceFiNFT4626, {
      unsafeAllow: ["delegatecall"],
    });

    const SpiceFiNFTFactory = await ethers.getContractFactory(
      "SpiceFiNFTFactory"
    );

    await expect(
      SpiceFiNFTFactory.deploy(
        ethers.constants.AddressZero,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        treasury.address
      )
    ).to.be.revertedWithCustomError(SpiceFiNFTFactory, "InvalidAddress");
    await expect(
      SpiceFiNFTFactory.deploy(
        beacon.address,
        ethers.constants.AddressZero,
        constants.accounts.Multisig,
        treasury.address
      )
    ).to.be.revertedWithCustomError(SpiceFiNFTFactory, "InvalidAddress");
    await expect(
      SpiceFiNFTFactory.deploy(
        beacon.address,
        constants.accounts.Dev,
        ethers.constants.AddressZero,
        treasury.address
      )
    ).to.be.revertedWithCustomError(SpiceFiNFTFactory, "InvalidAddress");
    await expect(
      SpiceFiNFTFactory.deploy(
        beacon.address,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        ethers.constants.AddressZero
      )
    ).to.be.revertedWithCustomError(SpiceFiNFTFactory, "InvalidAddress");

    factory = await SpiceFiNFTFactory.deploy(
      beacon.address,
      constants.accounts.Dev,
      constants.accounts.Multisig,
      treasury.address
    );

    defaultAdminRole = await factory.DEFAULT_ADMIN_ROLE();
    assetRole = await factory.ASSET_ROLE();
    vaultRole = await factory.VAULT_ROLE();
    aggregatorRole = await factory.AGGREGATOR_ROLE();

    expect(await factory.beacon()).to.be.eq(beacon.address);
    await checkRole(factory, admin.address, defaultAdminRole, true);
  });

  beforeEach(async () => {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("When missing ASSET_ROLE", async function () {
    await expect(
      factory
        .connect(alice)
        .createVault(
          constants.tokens.WETH,
          ethers.utils.parseEther("0.08"),
          555,
          [vault.address, bend.address, drops.address]
        )
    ).to.be.revertedWith(
      `AccessControl: account ${constants.tokens.WETH.toLowerCase()} is missing role ${assetRole}`
    );
  });

  it("When missing VAULT_ROLE", async function () {
    await factory.grantRole(assetRole, constants.tokens.WETH);
    await expect(
      factory
        .connect(alice)
        .createVault(
          constants.tokens.WETH,
          ethers.utils.parseEther("0.08"),
          555,
          [vault.address, bend.address, drops.address]
        )
    ).to.be.revertedWith(
      `AccessControl: account ${vault.address.toLowerCase()} is missing role ${vaultRole}`
    );
  });

  it("When asset is 0x0", async function () {
    const SpiceFiNFTFactory = await ethers.getContractFactory(
      "SpiceFiNFTFactory"
    );
    await expect(
      factory
        .connect(alice)
        .createVault(
          ethers.constants.AddressZero,
          ethers.utils.parseEther("0.08"),
          555,
          []
        )
    ).to.be.revertedWithCustomError(SpiceFiNFTFactory, "InvalidAddress");
  });

  it("When max supply is 0", async function () {
    const SpiceFiNFTFactory = await ethers.getContractFactory(
      "SpiceFiNFTFactory"
    );
    await expect(
      factory
        .connect(alice)
        .createVault(
          constants.tokens.WETH,
          ethers.utils.parseEther("0.08"),
          0,
          []
        )
    ).to.be.revertedWithCustomError(SpiceFiNFTFactory, "ParameterOutOfBounds");
  });

  it("Create Vault", async function () {
    await factory.grantRole(assetRole, constants.tokens.WETH);
    await factory.grantRole(vaultRole, vault.address);
    await factory.grantRole(vaultRole, bend.address);
    await factory.grantRole(vaultRole, drops.address);

    const created = await factory
      .connect(alice)
      .callStatic.createVault(
        constants.tokens.WETH,
        ethers.utils.parseEther("0.08"),
        555,
        [vault.address, bend.address, drops.address]
      );

    const tx = await factory
      .connect(alice)
      .createVault(
        constants.tokens.WETH,
        ethers.utils.parseEther("0.08"),
        555,
        [vault.address, bend.address, drops.address]
      );

    await expect(tx)
      .to.emit(factory, "VaultCreated")
      .withArgs(alice.address, created);

    const createdVault = await ethers.getContractAt("SpiceFiNFT4626", created);
    await checkRole(createdVault, vault.address, vaultRole, true);
    await checkRole(createdVault, bend.address, vaultRole, true);
    await checkRole(createdVault, drops.address, vaultRole, true);
    await checkRole(factory, createdVault.address, aggregatorRole, true);
    expect(await createdVault.mintPrice()).to.be.eq(
      ethers.utils.parseEther("0.08")
    );
    expect(await createdVault.maxSupply()).to.be.eq(555);
  });

  describe("Setters", function () {
    it("Set Dev", async function () {
      await expect(
        factory.connect(alice).setDev(bob.address)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        factory.connect(admin).setDev(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(factory, "InvalidAddress");

      const tx = await factory.connect(admin).setDev(bob.address);

      await expect(tx).to.emit(factory, "DevUpdated").withArgs(bob.address);
      expect(await factory.dev()).to.be.eq(bob.address);
    });

    it("Set Multisig", async function () {
      await expect(
        factory.connect(alice).setMultisig(bob.address)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        factory.connect(admin).setMultisig(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(factory, "InvalidAddress");

      const tx = await factory.connect(admin).setMultisig(bob.address);

      await expect(tx)
        .to.emit(factory, "MultisigUpdated")
        .withArgs(bob.address);
      expect(await factory.multisig()).to.be.eq(bob.address);
    });

    it("Set Fee Recipient", async function () {
      await expect(
        factory.connect(alice).setFeeRecipient(bob.address)
      ).to.be.revertedWith(
        `AccessControl: account ${alice.address.toLowerCase()} is missing role ${defaultAdminRole}`
      );

      await expect(
        factory.connect(admin).setFeeRecipient(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(factory, "InvalidAddress");

      const tx = await factory.connect(admin).setFeeRecipient(bob.address);

      await expect(tx)
        .to.emit(factory, "FeeRecipientUpdated")
        .withArgs(bob.address);
      expect(await factory.feeRecipient()).to.be.eq(bob.address);
    });
  });
});
