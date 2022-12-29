fs = require("fs");
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { impersonateAccount } = require("../test/helpers/account");
const constants = require("../test/constants");

async function main() {
  // tokens
  let weth;

  // vaults
  let vault;
  let bend;
  let drops;
  let spiceVault;

  // accounts
  let admin, alice, bob, carol, strategist, assetReceiver, treasury;

  // constants
  const vaultName = "Spice Vault Test Token";
  const vaultSymbol = "svTT";
  const bendVaultName = "Spice interest bearing WETH";
  const bendVaultSymbol = "spiceETH";
  const dropsVaultName = "Spice CEther";
  const dropsVaultSymbol = "SCEther";

  async function checkRole(contract, user, role, check) {
    expect(await contract.hasRole(role, user)).to.equal(check);
  }

  async function deployTokenAndAirdrop(users, amount) {
    const Token = await ethers.getContractFactory("TestERC20");
    const token = await Token.deploy("TestToken", "TT");

    for (let i = 0; i < users.length; i++) {
      await token.mint(users[i].address, amount);
    }

    return token;
  }

  [admin, alice, bob, carol, strategist, spiceAdmin, assetReceiver, treasury] =
    await ethers.getSigners();

  await impersonateAccount(constants.accounts.Whale);
  whale = await ethers.getSigner(constants.accounts.Whale);

  const amount = ethers.utils.parseEther("1000000");
  token = await deployTokenAndAirdrop([admin, alice, bob, carol], amount);
  weth = await ethers.getContractAt("TestERC20", constants.tokens.WETH, admin);

  const Vault = await ethers.getContractFactory("Vault");

  vault = await upgrades.deployProxy(
    Vault,
    [vaultName, vaultSymbol, weth.address, 0, treasury.address],
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

  spiceVault = await upgrades.deployProxy(
    SpiceFi4626,
    [weth.address, strategist.address, assetReceiver.address, 700],
    {
      unsafeAllow: ["delegatecall"],
      kind: "uups",
    }
  );

  const SpiceFiNFT4626 = await ethers.getContractFactory("SpiceFiNFT4626");

  spiceNFTVault = await upgrades.deployProxy(
    SpiceFiNFT4626,
    [weth.address, strategist.address, assetReceiver.address, 700],
    {
      unsafeAllow: ["delegatecall"],
      kind: "uups",
    }
  );

  out = {
    "spice-nftfi": vault.address,
    bend: bend.address,
    drops: drops.address,
    spiceVault: spiceVault.address,
    spiceNFTVault: spiceNFTVault.address,
  };

  fs.writeFile(
    __dirname + "/../cache/contracts-addr.json",
    JSON.stringify(out),
    function (err) {
      if (err) console.log(err);
    }
  );

  // set up spicefi4626
  await spiceVault.setMaxTotalSupply(ethers.constants.MaxUint256);

  defaultAdminRole = await spiceVault.DEFAULT_ADMIN_ROLE();
  strategistRole = await spiceVault.STRATEGIST_ROLE();
  vaultRole = await spiceVault.VAULT_ROLE();
  assetReceiverRole = await spiceVault.ASSET_RECEIVER_ROLE();
  userRole = await spiceVault.USER_ROLE();
  spiceRole = await spiceVault.SPICE_ROLE();

  await spiceVault.grantRole(strategistRole, strategist.address);
  await spiceVault.grantRole(strategistRole, admin.address);
  await spiceVault.grantRole(vaultRole, vault.address);
  await spiceVault.grantRole(vaultRole, bend.address);
  await spiceVault.grantRole(vaultRole, drops.address);
  await checkRole(spiceVault, strategist.address, strategistRole, true);
  await checkRole(spiceVault, vault.address, vaultRole, true);
  await checkRole(spiceVault, bend.address, vaultRole, true);
  await checkRole(spiceVault, drops.address, vaultRole, true);

  await spiceVault.grantRole(spiceRole, spiceAdmin.address);
  await checkRole(spiceVault, spiceAdmin.address, spiceRole, true);

  // set up spicefinft4626
  await spiceNFTVault.setMaxTotalSupply(ethers.constants.MaxUint256);

  defaultAdminRoleNFT = await spiceNFTVault.DEFAULT_ADMIN_ROLE();
  strategistRoleNFT = await spiceNFTVault.STRATEGIST_ROLE();
  vaultRoleNFT = await spiceNFTVault.VAULT_ROLE();
  assetReceiverRoleNFT = await spiceNFTVault.ASSET_RECEIVER_ROLE();
  userRoleNFT = await spiceNFTVault.USER_ROLE();
  spiceRoleNFT = await spiceNFTVault.SPICE_ROLE();

  await spiceNFTVault.grantRole(strategistRoleNFT, strategist.address);
  await spiceNFTVault.grantRole(strategistRoleNFT, admin.address);
  await spiceNFTVault.grantRole(vaultRoleNFT, vault.address);
  await spiceNFTVault.grantRole(vaultRoleNFT, bend.address);
  await spiceNFTVault.grantRole(vaultRoleNFT, drops.address);
  await checkRole(spiceNFTVault, strategist.address, strategistRoleNFT, true);
  await checkRole(spiceNFTVault, vault.address, vaultRoleNFT, true);
  await checkRole(spiceNFTVault, bend.address, vaultRoleNFT, true);
  await checkRole(spiceNFTVault, drops.address, vaultRoleNFT, true);

  await spiceNFTVault.grantRole(spiceRoleNFT, spiceAdmin.address);
  await checkRole(spiceNFTVault, spiceAdmin.address, spiceRoleNFT, true);

  // deposit initial funds into spice vault
  async function depositfunds() {
    const amount = ethers.utils.parseEther("10");
    await weth.connect(whale).approve(spiceVault.address, amount);
    //let tx: ContractTransaction = await myToken.connect(accounts[0]).transfer(accounts[1].address, 1);
    //let receipt: ContractReceipt = await tx.wait();
    //console.log(receipt.events?.filter((x) => {return x.event == "Transfer"}));
    await spiceVault
      .connect(whale)
      ["deposit(uint256,address)"](amount, whale.address);
  }
  await depositfunds();
  console.log(weth.address);
  console.log(whale.address);
  async function transferfunds() {
    const amount = ethers.utils.parseEther("10");
    await weth.connect(whale).transfer(admin.address, amount);
  }
  await transferfunds();
  let y = await weth.connect(whale).balanceOf(admin.address);
  console.log(y);

  // deposit initial funds into spice nft vault
  async function depositfundsNFT() {
    const amount = ethers.utils.parseEther("10");
    await weth.connect(whale).approve(spiceNFTVault.address, amount);
    //let tx: ContractTransaction = await myToken.connect(accounts[0]).transfer(accounts[1].address, 1);
    //let receipt: ContractReceipt = await tx.wait();
    //console.log(receipt.events?.filter((x) => {return x.event == "Transfer"}));
    await spiceNFTVault
      .connect(whale)
      ["deposit(uint256,address)"](amount, whale.address);
  }
  await depositfundsNFT();
  console.log(weth.address);
  console.log(whale.address);
  async function transferfundsNFT() {
    const amount = ethers.utils.parseEther("10");
    await weth.connect(whale).transfer(admin.address, amount);
  }
  await transferfundsNFT();
  let nfty = await weth.connect(whale).balanceOf(admin.address);
  console.log(nfty);

  //async function approvefunds () {
  //const amount = ethers.utils.parseEther("10");
  //await spiceVault
  //.connect(admin)
  //.approveAsset(vault.address, amount);
  //let y = await weth.allowance(spiceVault.address, vault.address);
  //console.log(y);
  //};
  //await approvefunds();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
