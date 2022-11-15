fs = require('fs');
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { impersonateAccount } = require("./helpers/account");
const constants = require("./constants");

describe("pyTest", function () {
    // tokens
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
	assetReceiver;

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

	spiceVault = await upgrades.deployProxy(SpiceFi4626, [
	    weth.address,
	    strategist.address,
	    assetReceiver.address,
	    700,
	]);
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

    it("Should set the correct name", async function () {
	expect(await spiceVault.name()).to.equal("SpiceToken");
    });
});
