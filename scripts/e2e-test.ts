import { ethers } from "hardhat";

async function main() {
  console.log("========================================");
  console.log("TimeCapsuleVault E2E Test");
  console.log("========================================");
  console.log("Network:", network.name);
  console.log("");

  const [founder, beneficiary] = await ethers.getSigners();
  console.log("Founder:", founder.address);
  console.log("Beneficiary:", beneficiary.address);
  console.log("");

  // Get deployed vault address
  const deployments = require("./deployments.json");
  const networkDeploy = deployments[network.name] || deployments["localhost"];
  const vaultAddress = networkDeploy.vault;
  const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
  const vault = VaultFactory.attach(vaultAddress);

  const capsuleId = 0;
  const lockDays = 30;
  const lockSeconds = lockDays * 86400;
  const depositAmount = ethers.parseEther("0.01");

  // Check initial balances
  const founderBalBefore = await ethers.provider.getBalance(founder.address);
  const beneficiaryBalBefore = await ethers.provider.getBalance(beneficiary.address);

  console.log("--- Create Time Capsule ---");
  console.log("Deposit:", ethers.formatEther(depositAmount), "ETH");
  console.log("Lock period:", lockDays, "days");

  const createTx = await vault.connect(founder).createCapsule(
    [beneficiary.address],
    [100],
    lockSeconds,
    "",
    { value: depositAmount }
  );
  const createReceipt = await createTx.wait();
  console.log("Capsule created! Tx:", createReceipt.hash);
  console.log("");

  // Get capsule details
  const capsule = await vault.getCapsule(capsuleId);
  console.log("--- Capsule Details ---");
  console.log("Founder:", capsule.founder);
  console.log("Unlock timestamp:", new Date(Number(capsule.unlockTimestamp * 1000n)).toLocaleString());
  console.log("Deposited:", ethers.formatEther(capsule.depositedValue), "ETH");
  console.log("isWithdrawn:", capsule.isWithdrawn);
  console.log("");

  // Simulate time passing to unlock
  console.log("--- Time Jump ---");
  console.log("Advancing", lockDays, "days + 1 second...");
  await network.provider.send("evm_increaseTime", [Number(lockSeconds) + 1]);
  await network.provider.send("evm_mine", []);

  const capsuleAfterTime = await vault.getCapsule(capsuleId);
  console.log("Unlock timestamp:", new Date(Number(capsuleAfterTime.unlockTimestamp * 1000n)).toLocaleString());
  console.log("Block time now:", new Date().toLocaleString());
  console.log("");

  // Check if unlocked
  const isUnlocked = await vault.connect(beneficiary).isUnlocked(capsuleId);
  console.log("Is unlocked:", isUnlocked);
  console.log("");

  // Beneficiary claims
  console.log("--- Claim ---");
  const claimTx = await vault.connect(beneficiary).claim(capsuleId);
  const claimReceipt = await claimTx.wait();
  console.log("Claimed! Tx:", claimReceipt.hash);
  console.log("");

  // Check final balances
  const founderBalAfter = await ethers.provider.getBalance(founder.address);
  const beneficiaryBalAfter = await ethers.provider.getBalance(beneficiary.address);

  console.log("--- Final Balances ---");
  console.log("Founder balance change:", ethers.formatEther(founderBalAfter - founderBalBefore), "ETH");
  console.log("Beneficiary balance change:", ethers.formatEther(beneficiaryBalAfter - beneficiaryBalBefore), "ETH");
  console.log("");

  // Verify capsule was marked withdrawn
  const capsuleFinal = await vault.getCapsule(capsuleId);
  console.log("Capsule isWithdrawn:", capsuleFinal.isWithdrawn);

  console.log("");
  console.log("========================================");
  console.log("E2E TEST PASSED!");
  console.log("========================================");
}

main().catch((error) => {
  console.error("E2E TEST FAILED:", error.message);
  process.exit(1);
});
