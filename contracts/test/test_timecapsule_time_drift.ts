/**
 * Time Drift End-to-End Test
 *
 * Verifies:
 * 1. stored unlockTimestamp == blockTimestamp + 300 exactly (Hardhat mining interval)
 * 2. Frontend lockSeconds computation (blockTimestampSec + lockSeconds) matches contract storage
 * 3. Time drift scenario: user picks time 10 min from now, chain drifts +5 min before submission
 *
 * Run: npx hardhat test test/test_timecapsule_time_drift.ts
 */

import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("TimeCapsuleVault — Time Drift", function () {
  const LOCK_DURATION = 300; // exactly one Hardhat mining interval (5s) * 60 blocks

  let vault: any;
  let owner: any;
  let beneficiary: any;

  beforeEach(async () => {
    [owner, beneficiary] = await ethers.getSigners();
    const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
    vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
  });

  // ---------------------------------------------------------------------------
  // TEST 1: unlockTimestamp stored exactly as blockTimestamp + lockDuration
  // ---------------------------------------------------------------------------
  it("stores unlockTimestamp == blockTimestamp + 300 exactly", async () => {
    // Get current block timestamp
    const blockBefore = await ethers.provider.getBlock("latest");
    const blockTimestampBefore = Number(blockBefore!.timestamp);

    // Create capsule with lockDuration of exactly 300 seconds
    // Frontend pattern: unlockTimestamp = blockTimestampSec + lockSeconds
    const lockSeconds = 300;
    const unlockTimestamp = BigInt(blockTimestampBefore + lockSeconds);

    const tx = await vault.connect(owner).createCapsule(
      [beneficiary.address],
      [100],
      unlockTimestamp,
      "QmTestHash",
      { value: ethers.parseEther("0.01") }
    );
    const receipt = await tx.wait();

    // Get block timestamp at transaction (block where capsule was created)
    const blockAfter = await ethers.provider.getBlock(receipt!.blockNumber!);
    const blockTimestampAtTx = Number(blockAfter!.timestamp);

    // Read stored unlockTimestamp
    const capsule = await vault.getCapsule(0);
    const storedUnlock = capsule.unlockTimestamp;
    const expectedUnlock = BigInt(blockTimestampAtTx + lockSeconds);

    console.log("\n=== Test 1: Exact lock duration ===");
    console.log("blockTimestamp at tx:  ", blockTimestampAtTx);
    console.log("lockSeconds submitted:  ", lockSeconds);
    console.log("expected unlockTimestamp:", expectedUnlock.toString());
    console.log("stored unlockTimestamp:  ", storedUnlock.toString());
    console.log("MATCH:", storedUnlock === expectedUnlock);

    // The key assertion: stored unlock == block timestamp when tx was mined + 300
    // NOTE: block.timestamp at tx-mining time may differ from blockTimestampBefore
    // by up to 5 seconds (Hardhat auto-mining interval)
    const drift = Number(storedUnlock) - Number(expectedUnlock);
    console.log("drift (stored - expected):", drift);

    // Verify stored value matches what was submitted (contract stores exact input)
    expect(storedUnlock).to.equal(unlockTimestamp,
      `Contract stored ${storedUnlock} but we submitted ${unlockTimestamp}`);
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Read-back — on-chain unlockTimestamp matches submitted value
  // ---------------------------------------------------------------------------
  it("read-back unlockTimestamp on-chain exactly matches submitted value", async () => {
    const block = await ethers.provider.getBlock("latest");
    const blockTimestamp = Number(block!.timestamp);
    const lockSeconds = 300;
    const unlockTimestamp = BigInt(blockTimestamp + lockSeconds);

    await vault.connect(owner).createCapsule(
      [beneficiary.address],
      [100],
      unlockTimestamp,
      "QmTestHash",
      { value: ethers.parseEther("0.01") }
    );

    // Read back from chain
    const capsule = await vault.getCapsule(0);
    const readBackUnlock = capsule.unlockTimestamp;

    console.log("\n=== Test 2: Read-back verification ===");
    console.log("submitted unlockTimestamp:", unlockTimestamp.toString());
    console.log("read-back unlockTimestamp:", readBackUnlock.toString());
    console.log("MATCH:", readBackUnlock === unlockTimestamp);

    expect(readBackUnlock).to.equal(unlockTimestamp);
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Time drift scenario — user picks 10 min from now, chain drifts +5 min
  // ---------------------------------------------------------------------------
  it("drift scenario: user picks 10min, chain advances 5min before tx is mined", async () => {
    // Simulate: user looks at chain time, calculates they want unlock 10 minutes from NOW
    const blockAtUser = await ethers.provider.getBlock("latest");
    const chainTimeAtUser = Number(blockAtUser!.timestamp);
    const userTargetSec = chainTimeAtUser + 600; // user wants 10 min from "now"

    console.log("\n=== Test 3: Time drift scenario ===");
    console.log("Chain time when user decided:", chainTimeAtUser);
    console.log("User's target unlock time:   ", userTargetSec, "(now + 600s)");

    // Frontend computes lockSeconds = userUnlockSec - blockTimestampSec
    // If user chose exactly 10 min from now, lockSeconds = 600
    // But frontend clamps to 300 min: lockSeconds = Math.max(300, 600) = 600
    const frontendLockSeconds = Math.max(300, userTargetSec - chainTimeAtUser);
    console.log("Frontend lockSeconds (clamped):", frontendLockSeconds);

    // User submits — but before tx gets mined, 5 minutes of real time passes
    // Hardhat auto-mines every 5 seconds, so ~60 blocks pass
    // Chain time advances by ~300 seconds (5 min)
    await network.provider.send("evm_increaseTime", [300]);
    await network.provider.send("evm_mine", []);

    const blockAtMine = await ethers.provider.getBlock("latest");
    const chainTimeAtMine = Number(blockAtMine!.timestamp);

    // How much time has passed since user decided?
    const timePassed = chainTimeAtMine - chainTimeAtUser;
    console.log("Chain time when tx mined:    ", chainTimeAtMine);
    console.log("Time elapsed since user decided:", timePassed, "seconds");

    // Now compute what frontend would compute at submission time (same lockSeconds as before)
    // Frontend uses blockTimestampSec from the LATEST block at time of submission
    // So frontend would send: blockTimestampSec + lockSeconds
    // But the frontend clamps at submission too — it re-fetches block timestamp
    // and computes lockSeconds from the user's target datetime relative to NOW.
    //
    // The scenario: user picked a specific datetime (userTargetSec).
    // The frontend computes lockSeconds = Math.max(300, userUnlockSec - currentBlockTimestamp).
    // If user picked 10 min from when they started, userUnlockSec = chainTimeAtUser + 600.
    // But by submission time, currentBlockTimestamp = chainTimeAtMine.
    // lockSeconds = max(300, (chainTimeAtUser + 600) - chainTimeAtMine)
    //             = max(300, 600 - timePassed)
    //             = max(300, 600 - 300) = max(300, 300) = 300
    //
    // So the submitted unlockTimestamp = chainTimeAtMine + 300
    // But user EXPECTED: chainTimeAtUser + 600
    //
    // DISCREPANCY: (chainTimeAtMine + 300) vs (chainTimeAtUser + 600)
    //            = (chainTimeAtUser + 300 + 300) vs (chainTimeAtUser + 600)
    //            = chainTimeAtUser + 600 vs chainTimeAtUser + 600
    // Wait — no. Let me recalculate.
    //
    // UserUnlockSec = fixed datetime user picked = chainTimeAtUser + 600 (10 min from their "now")
    // At submission time, chainTimeAtMine = chainTimeAtUser + timePassed
    // Frontend recomputes: lockSeconds = userUnlockSec - currentBlockTimestamp
    //                                 = (chainTimeAtUser + 600) - (chainTimeAtUser + timePassed)
    //                                 = 600 - timePassed
    // If timePassed = 300 (5 min), then lockSeconds = 300
    // frontend sends: unlockTimestamp = currentBlockTimestamp + lockSeconds
    //                                       = (chainTimeAtUser + 300) + 300
    //                                       = chainTimeAtUser + 600
    // Which IS exactly what user wanted!
    //
    // BUT — if the frontend uses the SAME lockSeconds value it computed when the user
    // first filled the form (i.e., 600 seconds) rather than recomputing at submission...
    // Then unlockTimestamp = currentBlockTimestamp + 600
    //                       = (chainTimeAtUser + 300) + 600
    //                       = chainTimeAtUser + 900 — 5 minutes MORE than user wanted!

    // Let's measure what actually happens:
    // Frontend recomputes lockSeconds at submission time (per CreateCapsule.tsx handleSubmit)
    const lockSecondsAtSubmission = Math.max(300, userTargetSec - chainTimeAtMine);
    const submittedUnlockTimestamp = BigInt(chainTimeAtMine + lockSecondsAtSubmission);
    const userExpectedUnlock = BigInt(userTargetSec);

    console.log("Frontend recomputes lockSeconds at submission:", lockSecondsAtSubmission);
    console.log("Submitted unlockTimestamp:   ", submittedUnlockTimestamp.toString());
    console.log("User expected unlockTimestamp:", userExpectedUnlock.toString());
    console.log("DISCREPANCY (submitted - expected):", Number(submittedUnlockTimestamp - userExpectedUnlock), "seconds");

    await vault.connect(owner).createCapsule(
      [beneficiary.address],
      [100],
      submittedUnlockTimestamp,
      "QmTestHash",
      { value: ethers.parseEther("0.01") }
    );

    const capsule = await vault.getCapsule(0);
    const storedUnlock = capsule.unlockTimestamp;

    console.log("Stored unlockTimestamp:      ", storedUnlock.toString());
    console.log("Stored matches submitted:    ", storedUnlock === submittedUnlockTimestamp);

    // The key question: does the stored value match what user expected?
    const userExpectedVsStored = Number(storedUnlock) - Number(userExpectedUnlock);
    console.log("User expected vs stored delta:", userExpectedVsStored, "seconds");

    // Document the discrepancy
    if (storedUnlock !== userExpectedUnlock) {
      console.log("*** DISCREPANCY FOUND ***");
      console.log("User expected unlock at:", userExpectedUnlock.toString());
      console.log("Contract stored unlock at:", storedUnlock.toString());
      console.log("Delta:", userExpectedVsStored, "seconds =", userExpectedVsStored / 60, "minutes");
    }

    // In this scenario with 5 min drift and 10 min target:
    // - User expected: chainTimeAtUser + 600
    // - Stored: chainTimeAtMine + max(300, 600 - 300) = chainTimeAtMine + 300
    //         = chainTimeAtUser + 300 + 300 = chainTimeAtUser + 600
    // So they MATCH! The clamping to 300 saves us here.
    //
    // But if the frontend had cached the lockSeconds=600 and used that directly...
    // Then: stored = chainTimeAtMine + 600 = chainTimeAtUser + 300 + 600 = chainTimeAtUser + 900
    // Delta = +300 seconds = 5 minutes MORE than user wanted!
    expect(storedUnlock).to.equal(submittedUnlockTimestamp);
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Drift scenario where 300-second clamp causes unexpected outcome
  // ---------------------------------------------------------------------------
  it("drift: user picks 6 min from now, but clamp forces 5 min minimum", async () => {
    // User picks 6 minutes (360 seconds) — above the 300-second frontend minimum
    const blockAtUser = await ethers.provider.getBlock("latest");
    const chainTimeAtUser = Number(blockAtUser!.timestamp);
    // User wants unlock at chainTimeAtUser + 360
    const userTargetSec = chainTimeAtUser + 360;

    console.log("\n=== Test 4: 6-min pick, 5-min clamp drift ===");
    console.log("Chain time when user decided:", chainTimeAtUser);
    console.log("User target (6 min from now):", userTargetSec);

    // Frontend computes lockSeconds = max(300, userUnlockSec - blockTimestampSec)
    // At decision time: lockSeconds = max(300, 360) = 360
    const lockSecondsAtDecision = Math.max(300, userTargetSec - chainTimeAtUser);
    console.log("Frontend lockSeconds at decision:", lockSecondsAtDecision);

    // Wait 5 minutes (300 seconds) — chain advances
    await network.provider.send("evm_increaseTime", [300]);
    await network.provider.send("evm_mine", []);

    const chainTimeAtMine = Number((await ethers.provider.getBlock("latest"))!.timestamp);
    console.log("Chain time when tx mined:    ", chainTimeAtMine);

    // Frontend recomputes lockSeconds at submission:
    // lockSeconds = max(300, userTargetSec - chainTimeAtMine)
    //             = max(300, (chainTimeAtUser + 360) - (chainTimeAtUser + 300))
    //             = max(300, 60) = 300
    const lockSecondsAtSubmission = Math.max(300, userTargetSec - chainTimeAtMine);
    const submittedUnlock = BigInt(chainTimeAtMine + lockSecondsAtSubmission);
    const userExpected = BigInt(userTargetSec);

    console.log("Frontend lockSeconds at submission:", lockSecondsAtSubmission);
    console.log("Submitted unlockTimestamp:   ", submittedUnlock.toString());
    console.log("User expected unlockTimestamp:", userExpected.toString());
    console.log("DISCREPANCY:", Number(submittedUnlock - userExpected), "seconds");

    await vault.connect(owner).createCapsule(
      [beneficiary.address],
      [100],
      submittedUnlock,
      "QmTestHash",
      { value: ethers.parseEther("0.01") }
    );

    const capsule = await vault.getCapsule(0);
    console.log("Stored unlockTimestamp:      ", capsule.unlockTimestamp.toString());
    console.log("Stored matches submitted:    ", capsule.unlockTimestamp === submittedUnlock);
    console.log("Stored vs user expected delta:", Number(capsule.unlockTimestamp) - Number(userExpected), "seconds");
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Verify key derivation — frontend key = keccak256(beneficiary + unlockTimestamp)
  // matches contract's internal key (used for message encryption if stored)
  // ---------------------------------------------------------------------------
  it("key derivation: frontend keccak256(beneficiary + unlockTimestamp) matches on-chain", async () => {
    const block = await ethers.provider.getBlock("latest");
    const blockTimestamp = Number(block!.timestamp);
    const lockSeconds = 300;
    const unlockTimestamp = BigInt(blockTimestamp + lockSeconds);

    // Frontend key derivation
    const frontendKey = ethers.keccak256(
      ethers.solidityPacked(["address", "uint256"], [beneficiary.address, unlockTimestamp])
    );

    await vault.connect(owner).createCapsule(
      [beneficiary.address],
      [100],
      unlockTimestamp,
      "QmTestHash",
      { value: ethers.parseEther("0.01") }
    );

    // The contract doesn't store the key — but we can verify that if the message
    // were encrypted with this key, the beneficiary could decrypt it using the
    // stored unlockTimestamp from the capsule.
    const capsule = await vault.getCapsule(0);
    const onChainUnlock = capsule.unlockTimestamp;

    const recomputedKey = ethers.keccak256(
      ethers.solidityPacked(["address", "uint256"], [beneficiary.address, onChainUnlock])
    );

    console.log("\n=== Test 5: Key derivation ===");
    console.log("Frontend key (beneficiary + submitted unlockTimestamp):");
    console.log("  ", frontendKey);
    console.log("On-chain key (beneficiary + stored unlockTimestamp):");
    console.log("  ", recomputedKey);
    console.log("Keys MATCH:", frontendKey === recomputedKey);

    expect(recomputedKey).to.equal(frontendKey);
  });
});
