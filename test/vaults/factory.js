const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("../helpers/snapshot");
const constants = require("../constants");

describe("SpiceFiFactory", function () {
  let weth;
  let vault;
  let bend;
  let drops;
  let impl;
  let factory;

  let admin, alice, bob, carol, strategist, spiceAdmin, assetReceiver, treasury;

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
    [
      admin,
      alice,
      bob,
      carol,
      strategist,
      spiceAdmin,
      assetReceiver,
      treasury,
    ] = await ethers.getSigners();

    weth = await ethers.getContractAt(
      "TestERC20",
      constants.tokens.WETH,
      admin
    );

    const Vault = await ethers.getContractFactory("Vault");

    vault = await upgrades.deployProxy(
      Vault,
      [
        "Spice Vault Test Token",
        "svTT",
        weth.address,
        [],
        admin.address,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        treasury.address,
      ],
      {
        kind: "uups",
      }
    );

    const Bend4626 = await ethers.getContractFactory("Bend4626");

    bend = await upgrades.deployProxy(
      Bend4626,
      [
        bendVaultName,
        bendVaultSymbol,
        constants.contracts.BendPool,
        constants.tokens.BendWETH,
      ],
      {
        kind: "uups",
      }
    );

    const Drops4626 = await ethers.getContractFactory("Drops4626");

    drops = await upgrades.deployProxy(
      Drops4626,
      [dropsVaultName, dropsVaultSymbol, constants.tokens.DropsETH],
      {
        kind: "uups",
      }
    );

    const SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626");

    impl = await upgrades.deployProxy(
      SpiceFi4626,
      [
        "Spice0",
        "s0",
        constants.tokens.WETH,
        [],
        admin.address,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        treasury.address,
      ],
      {
        unsafeAllow: ["delegatecall"],
        kind: "uups",
      }
    );

    defaultAdminRole = await impl.DEFAULT_ADMIN_ROLE();

    const SpiceFiFactory = await ethers.getContractFactory("SpiceFiFactory");

    await expect(
      SpiceFiFactory.deploy(
        ethers.constants.AddressZero,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        treasury.address
      )
    ).to.be.revertedWithCustomError(SpiceFiFactory, "InvalidAddress");
    await expect(
      SpiceFiFactory.deploy(
        impl.address,
        ethers.constants.AddressZero,
        constants.accounts.Multisig,
        treasury.address
      )
    ).to.be.revertedWithCustomError(SpiceFiFactory, "InvalidAddress");
    await expect(
      SpiceFiFactory.deploy(
        impl.address,
        constants.accounts.Dev,
        ethers.constants.AddressZero,
        treasury.address
      )
    ).to.be.revertedWithCustomError(SpiceFiFactory, "InvalidAddress");
    await expect(
      SpiceFiFactory.deploy(
        impl.address,
        constants.accounts.Dev,
        constants.accounts.Multisig,
        ethers.constants.AddressZero
      )
    ).to.be.revertedWithCustomError(SpiceFiFactory, "InvalidAddress");

    const implAddr = await upgrades.erc1967.getImplementationAddress(
      impl.address
    );
    factory = await SpiceFiFactory.deploy(
      implAddr,
      constants.accounts.Dev,
      constants.accounts.Multisig,
      treasury.address
    );

    assetRole = await factory.ASSET_ROLE();
    vaultRole = await factory.VAULT_ROLE();
    aggregatorRole = await factory.AGGREGATOR_ROLE();

    expect(await factory.implementation()).to.be.eq(implAddr);
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
        .createVault(constants.tokens.WETH, [
          vault.address,
          bend.address,
          drops.address,
        ])
    ).to.be.revertedWith(
      `AccessControl: account ${constants.tokens.WETH.toLowerCase()} is missing role ${assetRole}`
    );
  });

  it("When missing VAULT_ROLE", async function () {
    await factory.grantRole(assetRole, constants.tokens.WETH);
    await expect(
      factory
        .connect(alice)
        .createVault(constants.tokens.WETH, [
          vault.address,
          bend.address,
          drops.address,
        ])
    ).to.be.revertedWith(
      `AccessControl: account ${vault.address.toLowerCase()} is missing role ${vaultRole}`
    );
  });

  it("When asset is 0x0", async function () {
    const SpiceFiFactory = await ethers.getContractFactory("SpiceFiFactory");
    await expect(
      factory.connect(alice).createVault(ethers.constants.AddressZero, [])
    ).to.be.revertedWithCustomError(SpiceFiFactory, "InvalidAddress");
  });

  it("Create Vault", async function () {
    await factory.grantRole(assetRole, constants.tokens.WETH);
    await factory.grantRole(vaultRole, vault.address);
    await factory.grantRole(vaultRole, bend.address);
    await factory.grantRole(vaultRole, drops.address);

    const created = await factory
      .connect(alice)
      .callStatic.createVault(constants.tokens.WETH, [
        vault.address,
        bend.address,
        drops.address,
      ]);

    const tx = await factory
      .connect(alice)
      .createVault(constants.tokens.WETH, [
        vault.address,
        bend.address,
        drops.address,
      ]);

    await expect(tx)
      .to.emit(factory, "VaultCreated")
      .withArgs(alice.address, created);

    const createdVault = await ethers.getContractAt("SpiceFi4626", created);
    await checkRole(createdVault, vault.address, vaultRole, true);
    await checkRole(createdVault, bend.address, vaultRole, true);
    await checkRole(createdVault, drops.address, vaultRole, true);
    await checkRole(factory, createdVault.address, aggregatorRole, true);
  });
});
