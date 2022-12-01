const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { takeSnapshot, revertToSnapshot } = require("../helpers/snapshot");
const constants = require("../constants");

describe("SpiceFiFactory", function () {
  let weth;
  let unwrapper;
  let vault;
  let bend;
  let drops;
  let impl;
  let factory;

  let admin,
    alice,
    bob,
    carol,
    strategist,
    spiceAdmin,
    assetReceiver,
    vaultReceiver;

  let snapshotId;

  let defaultAdminRole, vaultRole, aggregatorRole;

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

    weth = await ethers.getContractAt(
      "TestERC20",
      constants.tokens.WETH,
      admin
    );

    const WETHUnwrapper = await ethers.getContractFactory("WETHUnwrapper");
    unwrapper = await WETHUnwrapper.deploy();

    const Vault = await ethers.getContractFactory("Vault");

    vault = await upgrades.deployProxy(Vault, [
      vaultName,
      vaultSymbol,
      weth.address,
      0,
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
      unwrapper.address,
    ]);

    const SpiceFi4626 = await ethers.getContractFactory("SpiceFi4626");

    impl = await upgrades.deployProxy(
      SpiceFi4626,
      [constants.tokens.WETH, strategist.address, assetReceiver.address, 700],
      {
        unsafeAllow: ["delegatecall"],
      }
    );

    defaultAdminRole = await impl.DEFAULT_ADMIN_ROLE();

    const SpiceFiFactory = await ethers.getContractFactory("SpiceFiFactory");

    await expect(
      SpiceFiFactory.deploy(ethers.constants.AddressZero)
    ).to.be.revertedWithCustomError(SpiceFiFactory, "InvalidAddress");

    const implAddr = await upgrades.erc1967.getImplementationAddress(
      impl.address
    );
    factory = await SpiceFiFactory.deploy(implAddr);

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

  it("When missing VAULT_ROLE", async function () {
    await expect(
      factory
        .connect(alice)
        .createVault(
          constants.tokens.WETH,
          assetReceiver.address,
          [vault.address, bend.address, drops.address],
          700
        )
    ).to.be.revertedWith(
      `AccessControl: account ${vault.address.toLowerCase()} is missing role ${vaultRole}`
    );
  });

  it("When asset is 0x0", async function () {
    const SpiceFiFactory = await ethers.getContractFactory("SpiceFiFactory");
    await expect(
      factory
        .connect(alice)
        .createVault(
          ethers.constants.AddressZero,
          assetReceiver.address,
          [],
          700
        )
    ).to.be.revertedWithCustomError(SpiceFiFactory, "InvalidAddress");
  });

  it("When asset receiver is 0x0", async function () {
    const SpiceFiFactory = await ethers.getContractFactory("SpiceFiFactory");
    await expect(
      factory
        .connect(alice)
        .createVault(
          constants.tokens.WETH,
          ethers.constants.AddressZero,
          [],
          700
        )
    ).to.be.revertedWithCustomError(SpiceFiFactory, "InvalidAddress");
  });

  it("Create Vault", async function () {
    await factory.grantRole(vaultRole, vault.address);
    await factory.grantRole(vaultRole, bend.address);
    await factory.grantRole(vaultRole, drops.address);

    const created = await factory
      .connect(alice)
      .callStatic.createVault(
        constants.tokens.WETH,
        assetReceiver.address,
        [vault.address, bend.address, drops.address],
        700
      );

    const tx = await factory
      .connect(alice)
      .createVault(
        constants.tokens.WETH,
        assetReceiver.address,
        [vault.address, bend.address, drops.address],
        700
      );

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
