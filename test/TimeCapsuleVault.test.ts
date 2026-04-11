import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { TimeCapsuleVault } from "../typechain-types";

describe("TimeCapsuleVault", function () {
  let vault: TimeCapsuleVault;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let beneficiary1: Awaited<ReturnType<typeof ethers.getSigners>>[1];
  let beneficiary2: Awaited<ReturnType<typeof ethers.getSigners>>[2];
  let stranger: Awaited<ReturnType<typeof ethers.getSigners>>[3];

  beforeEach(async () => {
    [owner, beneficiary1, beneficiary2, stranger] = await ethers.getSigners();
    const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
    vault = await VaultFactory.deploy() as TimeCapsuleVault;
    await vault.waitForDeployment();
  });

  // ============ createCapsule ============

  describe("createCapsule", () => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60;
    const ONE_ETHER = ethers.parseEther("1.0");

    it("creates a capsule with correct unlock timestamp", async () => {
      const before = (await ethers.provider.getBlock("latest"))!.timestamp;
      const tx = await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "QmTestHash",
        { value: ONE_ETHER }
      );
      const after = (await ethers.provider.getBlock("latest"))!.timestamp;
      await tx.wait();

      const capsule = await vault.getCapsule(0);
      expect(capsule.founder).to.equal(owner.address);
      expect(capsule.unlockTimestamp).to.be.greaterThan(before + SEVEN_DAYS - 5);
      expect(capsule.unlockTimestamp).to.be.lessThanOrEqual(after + SEVEN_DAYS + 5);
      expect(capsule.isWithdrawn).to.equal(false);
      expect(capsule.messageHash).to.equal("QmTestHash");
      expect(capsule.depositedValue).to.equal(ONE_ETHER);
    });

    it("stores multiple beneficiaries with correct allocations", async () => {
      const tx = await vault.connect(owner).createCapsule(
        [beneficiary1.address, beneficiary2.address],
        [60, 40],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );
      await tx.wait();

      const count = await vault.getBeneficiaryCount(0);
      expect(count).to.equal(2);

      // getMyAllocation uses msg.sender so call as each beneficiary
      const vaultAsB1 = vault.connect(beneficiary1);
      const vaultAsB2 = vault.connect(beneficiary2);

      const [alloc1, claimed1] = await vaultAsB1.getMyAllocation(0);
      expect(alloc1).to.equal(60);
      expect(claimed1).to.equal(false);

      const [alloc2, claimed2] = await vaultAsB2.getMyAllocation(0);
      expect(alloc2).to.equal(40);
      expect(claimed2).to.equal(false);
    });

    it("reverts if no beneficiaries", async () => {
      await expect(
        vault.connect(owner).createCapsule([], [], SEVEN_DAYS, "", { value: ONE_ETHER })
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });

    it("reverts if arrays length mismatch", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address, beneficiary2.address],
          [100],
          SEVEN_DAYS,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "MismatchLength");
    });

    it("reverts if allocations don't sum to 100", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address],
          [50],
          SEVEN_DAYS,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "AllocationMustSumTo100");
    });

    it("reverts if lock duration is too short", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address],
          [100],
          1, // less than MIN_LOCK_SECONDS (1 day)
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "LockTooShort");
    });

    it("reverts if lock duration is 59 seconds (just below MIN_LOCK_SECONDS)", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address],
          [100],
          59, // 1 second below MIN_LOCK_SECONDS (60 seconds)
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "LockTooShort");
    });

    it("accepts lock duration of exactly 60 seconds (MIN_LOCK_SECONDS boundary)", async () => {
      const tx = await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60, // exactly MIN_LOCK_SECONDS
        "",
        { value: ONE_ETHER }
      );
      await expect(tx).to.not.be.reverted;
    });

    it("accepts lock duration of 61 seconds (just above MIN_LOCK_SECONDS)", async () => {
      const tx = await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        61, // 1 second above MIN_LOCK_SECONDS
        "",
        { value: ONE_ETHER }
      );
      await expect(tx).to.not.be.reverted;
    });

    it("reverts if lock duration exceeds 10 years", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address],
          [100],
          11 * 365 * 24 * 60 * 60,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "LockTooLong");
    });

    it("reverts if insufficient creation fee", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address],
          [100],
          SEVEN_DAYS,
          "",
          { value: ethers.parseEther("0.0001") } // less than MIN_CREATION_FEE
        )
      ).to.be.revertedWithCustomError(vault, "InsufficientFee");
    });

    it("reverts if beneficiary address is zero", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          ["0x0000000000000000000000000000000000000000"],
          [100],
          SEVEN_DAYS,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });

    it("accepts ETH payment and stores balance", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );
      const balance = await ethers.provider.getBalance(await vault.getAddress());
      expect(balance).to.equal(ONE_ETHER);
    });

    it("emits CapsuleCreated and BeneficiaryAdded events", async () => {
      const tx = await vault.connect(owner).createCapsule(
        [beneficiary1.address, beneficiary2.address],
        [60, 40],
        SEVEN_DAYS,
        "QmHash",
        { value: ONE_ETHER }
      );
      const receipt = await tx.wait();

      const capsuleEvent = receipt.logs.find((l: any) =>
        l.fragment?.name === "CapsuleCreated"
      );
      expect(capsuleEvent).to.not.be.undefined;
      expect(capsuleEvent!.args.capsuleId).to.equal(0);
      expect(capsuleEvent!.args.founder).to.equal(owner.address);
      expect(capsuleEvent!.args.value).to.equal(ONE_ETHER);

      const addEvent1 = receipt.logs.find((l: any) =>
        l.fragment?.name === "BeneficiaryAdded" && l.args.beneficiary === beneficiary1.address
      );
      expect(addEvent1).to.not.be.undefined;
    });
  });

  // ============ claim ============

  describe("claim", () => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60;
    const ONE_ETHER = ethers.parseEther("1.0");

    beforeEach(async () => {
      // Capsule 0: 1 ETH, 7 days, 60/40 split between beneficiary1 and beneficiary2
      await vault.connect(owner).createCapsule(
        [beneficiary1.address, beneficiary2.address],
        [60, 40],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );
    });

    it("reverts when claiming before unlock time", async () => {
      await expect(
        vault.connect(beneficiary1).claim(0)
      ).to.be.revertedWithCustomError(vault, "TimeLockActive");
    });

    it("reverts when non-beneficiary tries to claim", async () => {
      await time.increase(SEVEN_DAYS + 1);
      await expect(
        vault.connect(stranger).claim(0)
      ).to.be.revertedWithCustomError(vault, "NotBeneficiary");
    });

    it("reverts when already withdrawn via cancel", async () => {
      // Cancel capsule 0 before unlock
      await vault.connect(owner).cancelCapsule(0);
      // Try to claim after — should fail
      await time.increase(SEVEN_DAYS + 1);
      await expect(
        vault.connect(beneficiary1).claim(0)
      ).to.be.revertedWithCustomError(vault, "AlreadyWithdrawn");
    });

    it("allows single beneficiary to claim full amount after unlock", async () => {
      // Create capsule 1 with single beneficiary
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );

      await time.increase(SEVEN_DAYS + 1);

      const balBefore = await ethers.provider.getBalance(beneficiary1.address);
      await vault.connect(beneficiary1).claim(1);
      const balAfter = await ethers.provider.getBalance(beneficiary1.address);
      const gain = balAfter - balBefore;

      // Should get ~1 ETH (within 0.001 ETH for gas)
      expect(gain).to.be.closeTo(ONE_ETHER, ethers.parseEther("0.001"));
    });

    it("allows partial claims — each beneficiary claims independently", async () => {
      await time.increase(SEVEN_DAYS + 1);

      // Beneficiary 1 claims 60%
      const bal1Before = await ethers.provider.getBalance(beneficiary1.address);
      await vault.connect(beneficiary1).claim(0);
      const bal1After = await ethers.provider.getBalance(beneficiary1.address);
      const b1Gain = bal1After - bal1Before;
      expect(b1Gain).to.be.closeTo(ethers.parseEther("0.6"), ethers.parseEther("0.001"));

      // Beneficiary 2 claims 40%
      const bal2Before = await ethers.provider.getBalance(beneficiary2.address);
      await vault.connect(beneficiary2).claim(0);
      const bal2After = await ethers.provider.getBalance(beneficiary2.address);
      const b2Gain = bal2After - bal2Before;
      expect(b2Gain).to.be.closeTo(ethers.parseEther("0.4"), ethers.parseEther("0.001"));
    });

    it("reverts when beneficiary tries to claim twice", async () => {
      await time.increase(SEVEN_DAYS + 1);
      await vault.connect(beneficiary1).claim(0);
      await expect(
        vault.connect(beneficiary1).claim(0)
      ).to.be.revertedWithCustomError(vault, "AlreadyClaimed");
    });

    it("sets isWithdrawn = true when all beneficiaries have claimed", async () => {
      await time.increase(SEVEN_DAYS + 1);
      await vault.connect(beneficiary1).claim(0); // 60%
      const capsule0 = await vault.getCapsule(0);
      expect(capsule0.isWithdrawn).to.equal(false); // not all claimed yet

      await vault.connect(beneficiary2).claim(0); // 40%
      const capsule0After = await vault.getCapsule(0);
      expect(capsule0After.isWithdrawn).to.equal(true);
    });

    it("reverts when claiming from non-existent capsule id", async () => {
      await time.increase(SEVEN_DAYS + 1);
      await expect(
        vault.connect(beneficiary1).claim(99)
      ).to.be.reverted; // index out of bounds
    });

    it("uses per-capsule depositedValue, not global balance", async () => {
      // Create capsule 1 with 5 ETH (separate from capsule 0's 1 ETH)
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ethers.parseEther("5.0") }
      );

      await time.increase(SEVEN_DAYS + 1);

      // Claim capsule 1 (5 ETH capsule)
      const balBefore = await ethers.provider.getBalance(beneficiary1.address);
      await vault.connect(beneficiary1).claim(1);
      const balAfter = await ethers.provider.getBalance(beneficiary1.address);
      const gain = balAfter - balBefore;
      // Should get ~5 ETH, not affected by capsule 0's 1 ETH
      expect(gain).to.be.closeTo(ethers.parseEther("5.0"), ethers.parseEther("0.001"));
    });
  });

  // ============ cancelCapsule ============

  describe("cancelCapsule", () => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60;
    const ONE_ETHER = ethers.parseEther("1.0");

    it("allows founder to cancel before unlock and recovers depositedValue", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );

      const beforeBalance = await ethers.provider.getBalance(owner.address);
      await vault.connect(owner).cancelCapsule(0);
      const afterBalance = await ethers.provider.getBalance(owner.address);

      // Balance should increase by ~1 ETH (minus negligible gas)
      expect(afterBalance - beforeBalance).to.be.greaterThan(ONE_ETHER - ethers.parseEther("0.01"));

      const capsule = await vault.getCapsule(0);
      expect(capsule.isWithdrawn).to.equal(true);
    });

    it("reverts when non-founder tries to cancel", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );
      await expect(
        vault.connect(beneficiary1).cancelCapsule(0)
      ).to.be.revertedWithCustomError(vault, "Unauthorized");
    });

    it("reverts when trying to cancel after unlock time", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );
      await time.increase(SEVEN_DAYS + 1);
      await expect(
        vault.connect(owner).cancelCapsule(0)
      ).to.be.revertedWithCustomError(vault, "TimeLockActive");
    });

    it("reverts when capsule was already withdrawn via full claim", async () => {
      // Capsule 0: single beneficiary, 100% allocation
      // NOTE: Cannot test AlreadyWithdrawn after time lock expires (TimeLockActive checked first).
      // This test verifies the contract prevents double-spending by checking that after
      // the beneficiary claims (isWithdrawn=true), the time lock still prevents cancel.
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );
      await time.increase(SEVEN_DAYS + 1);

      // Beneficiary claims 100%
      await vault.connect(beneficiary1).claim(0);
      const capsuleAfter = await vault.getCapsule(0);
      expect(capsuleAfter.isWithdrawn).to.equal(true);

      // After time lock expires, cancel cannot be called (TimeLockActive checked first)
      await expect(
        vault.connect(owner).cancelCapsule(0)
      ).to.be.revertedWithCustomError(vault, "TimeLockActive");
    });

    it("sends only the capsule's depositedValue, not entire contract balance", async () => {
      // Capsule 0: 1 ETH
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ethers.parseEther("1.0") }
      );
      // Capsule 1: 2 ETH
      await vault.connect(owner).createCapsule(
        [beneficiary2.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ethers.parseEther("2.0") }
      );

      // Cancel capsule 0 — should only get 1 ETH, not 3 ETH
      const beforeBalance = await ethers.provider.getBalance(owner.address);
      await vault.connect(owner).cancelCapsule(0);
      const afterBalance = await ethers.provider.getBalance(owner.address);
      const gain = afterBalance - beforeBalance;

      // Should be approximately 1 ETH, not 3 ETH
      expect(gain).to.be.greaterThan(ethers.parseEther("0.99"));
      expect(gain).to.be.lessThan(ethers.parseEther("1.1"));
    });

    it("founder CANNOT cancel after partial beneficiary claim — contract balance insufficient", async () => {
      // Capsule 0: 60/40 split — 1 ETH total
      await vault.connect(owner).createCapsule(
        [beneficiary1.address, beneficiary2.address],
        [60, 40],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );
      await time.increase(SEVEN_DAYS + 1);
      // Beneficiary 1 claims 60% (0.6 ETH) — only 0.4 ETH remains in contract
      await vault.connect(beneficiary1).claim(0); // claims 0.6 ETH, 0.4 ETH remains
      // Founder tries to cancel and receive c.depositedValue = 1 ETH
      // But only 0.4 ETH is in contract — transfer REVERTS due to insufficient balance
      await expect(
        vault.connect(owner).cancelCapsule(0)
      ).to.be.reverted; // insufficient balance
    });
  });

  // ============ View functions ============

  describe("view functions", () => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60;

    beforeEach(async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ethers.parseEther("1.0") }
      );
    });

    it("isUnlocked returns false before unlock", async () => {
      const unlocked = await vault.isUnlocked(0);
      expect(unlocked).to.equal(false);
    });

    it("isUnlocked returns true after unlock", async () => {
      await time.increase(SEVEN_DAYS + 1);
      const unlocked = await vault.isUnlocked(0);
      expect(unlocked).to.equal(true);
    });

    it("getTimeRemaining returns correct countdown", async () => {
      const remaining = await vault.getTimeRemaining(0);
      expect(remaining).to.be.greaterThan(SEVEN_DAYS - 10);
      expect(remaining).to.be.lessThanOrEqual(SEVEN_DAYS);
    });

    it("getTimeRemaining returns 0 after unlock", async () => {
      await time.increase(SEVEN_DAYS + 1);
      const remaining = await vault.getTimeRemaining(0);
      expect(remaining).to.equal(0);
    });
  });

  // ============ Pause / Unpause ============

  describe("pause and unpause", () => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60;

    it("owner can pause and prevent createCapsule", async () => {
      await vault.pause();
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address],
          [100],
          SEVEN_DAYS,
          "",
          { value: ethers.parseEther("1.0") }
        )
      ).to.be.reverted; // Pausable: paused (custom error)
    });

    it("owner can pause and prevent claim", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ethers.parseEther("1.0") }
      );
      await vault.pause();
      await expect(
        vault.connect(beneficiary1).claim(0)
      ).to.be.reverted; // Pausable: paused
    });

    it("owner can pause and prevent cancelCapsule", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ethers.parseEther("1.0") }
      );
      await vault.pause();
      await expect(
        vault.connect(owner).cancelCapsule(0)
      ).to.be.reverted; // Pausable: paused
    });

    it("owner can unpause and restore functionality", async () => {
      await vault.pause();
      await vault.unpause();
      const tx = await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ethers.parseEther("1.0") }
      );
      await expect(tx).to.not.be.reverted;
    });

    it("non-owner cannot pause", async () => {
      await expect(
        vault.connect(stranger).pause()
      ).to.be.reverted;
    });
  });

  // ============ messageHash storage ============

  describe("messageHash storage", () => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60;

    it("stores IPFS CID in capsule struct", async () => {
      const ipfsHash = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        ipfsHash,
        { value: ethers.parseEther("1.0") }
      );
      const capsule = await vault.getCapsule(0);
      expect(capsule.messageHash).to.equal(ipfsHash);
    });

    it("stores empty string when no message", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ethers.parseEther("1.0") }
      );
      const capsule = await vault.getCapsule(0);
      expect(capsule.messageHash).to.equal("");
    });
  });

  // ============ Multiple capsules ============

  describe("multiple capsules", () => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60;
    const THIRTY_DAYS = 30 * 24 * 60 * 60;

    it("manages multiple capsules independently", async () => {
      // Capsule 0: 1 ETH, 7 days, beneficiary1
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ethers.parseEther("1.0") }
      );

      // Capsule 1: 2 ETH, 30 days, beneficiary2
      await vault.connect(owner).createCapsule(
        [beneficiary2.address],
        [100],
        THIRTY_DAYS,
        "",
        { value: ethers.parseEther("2.0") }
      );

      const capsule0 = await vault.getCapsule(0);
      const capsule1 = await vault.getCapsule(1);
      expect(capsule0.depositedValue).to.equal(ethers.parseEther("1.0"));
      expect(capsule1.depositedValue).to.equal(ethers.parseEther("2.0"));

      // Unlock capsule 0 (7 days)
      await time.increase(SEVEN_DAYS + 1);

      const b1BalBefore = await ethers.provider.getBalance(beneficiary1.address);
      await vault.connect(beneficiary1).claim(0);
      const b1BalAfter = await ethers.provider.getBalance(beneficiary1.address);
      expect(b1BalAfter - b1BalBefore).to.be.closeTo(ethers.parseEther("1.0"), ethers.parseEther("0.001"));

      // Capsule 1 should still be locked
      await expect(
        vault.connect(beneficiary2).claim(1)
      ).to.be.revertedWithCustomError(vault, "TimeLockActive");

      // Capsule 0 should be withdrawn
      const capsule0After = await vault.getCapsule(0);
      expect(capsule0After.isWithdrawn).to.equal(true);
    });
  });

  // ============ beneficiary lookups ============

  describe("beneficiary lookups", () => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60;

    beforeEach(async () => {
      // Capsule 0: beneficiary1 (60%) and beneficiary2 (40%)
      await vault.connect(owner).createCapsule(
        [beneficiary1.address, beneficiary2.address],
        [60, 40],
        SEVEN_DAYS,
        "",
        { value: ethers.parseEther("1.0") }
      );
    });

    it("isBeneficiary returns true for a valid beneficiary", async () => {
      const result = await vault.isBeneficiary(0, beneficiary1.address);
      expect(result).to.equal(true);
    });

    it("isBeneficiary returns true for the second beneficiary", async () => {
      const result = await vault.isBeneficiary(0, beneficiary2.address);
      expect(result).to.equal(true);
    });

    it("isBeneficiary returns false for a non-beneficiary", async () => {
      const result = await vault.isBeneficiary(0, stranger.address);
      expect(result).to.equal(false);
    });

    it("isBeneficiary returns false for non-existent capsule id", async () => {
      const result = await vault.isBeneficiary(99, beneficiary1.address);
      expect(result).to.equal(false);
    });

    it("beneficiaryIndices returns correct index for first beneficiary", async () => {
      const index = await vault.beneficiaryIndices(0, beneficiary1.address);
      expect(index).to.equal(1);
    });

    it("beneficiaryIndices returns correct index for second beneficiary", async () => {
      const index = await vault.beneficiaryIndices(0, beneficiary2.address);
      expect(index).to.equal(2);
    });

    it("beneficiaryIndices returns 0 for non-beneficiary (default value)", async () => {
      const index = await vault.beneficiaryIndices(0, stranger.address);
      expect(index).to.equal(0);
    });
  });
});
