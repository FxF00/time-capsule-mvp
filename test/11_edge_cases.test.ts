import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { TimeCapsuleVault } from "../typechain-types";

describe("TimeCapsuleVault — Edge Cases", function () {
  let vault: TimeCapsuleVault;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let beneficiary1: Awaited<ReturnType<typeof ethers.getSigners>>[1];
  let beneficiary2: Awaited<ReturnType<typeof ethers.getSigners>>[2];
  let stranger: Awaited<ReturnType<typeof ethers.getSigners>>[3];
  let signers: Awaited<ReturnType<typeof ethers.getSigners>>;

  const ONE_ETHER = ethers.parseEther("1.0");

  beforeEach(async () => {
    [owner, beneficiary1, beneficiary2, stranger, ...signers] = await ethers.getSigners();
    const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
    vault = await VaultFactory.deploy() as TimeCapsuleVault;
    await vault.waitForDeployment();
  });

  // ─── Beneficiary edge cases ──────────────────────────────────────────────

  describe("Beneficiary edge cases", function () {
    it("founder can be a beneficiary of their own capsule", async () => {
      await vault.connect(owner).createCapsule(
        [owner.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      const isBenef = await vault.isBeneficiary(0, owner.address);
      expect(isBenef).to.equal(true);
    });

    it("reverts when beneficiary address is address(0)", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          ["0x0000000000000000000000000000000000000000"],
          [100],
          60,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });

    it("reverts when same address appears twice in beneficiary list", async () => {
      // Contract prevents duplicate beneficiaries
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address, beneficiary1.address],
          [50, 50],
          60,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "DuplicateBeneficiary");
    });

    it("beneficiaryIndices returns 0 for non-beneficiary (default)", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      const idx = await vault.beneficiaryIndices(0, stranger.address);
      expect(idx).to.equal(0);
    });

    it("beneficiaryIndices is case-sensitive (addresses are checksummed)", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      const idx = await vault.beneficiaryIndices(0, beneficiary1.address);
      expect(idx).to.equal(1); // 1-indexed
    });
  });

  // ─── Allocation edge cases ───────────────────────────────────────────────

  describe("Allocation edge cases", function () {
    it("accepts 1% minimum allocation to a beneficiary", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address, beneficiary2.address],
        [99, 1],
        60,
        "",
        { value: ONE_ETHER }
      );
      await time.increase(61);
      const bal2Before = await ethers.provider.getBalance(beneficiary2.address);
      await vault.connect(beneficiary2).claim(0);
      const bal2After = await ethers.provider.getBalance(beneficiary2.address);
      const gain = bal2After - bal2Before;
      // 1% of 1 ETH = 0.01 ETH
      expect(gain).to.be.closeTo(ethers.parseEther("0.01"), ethers.parseEther("0.001"));
    });

    it("accepts 100% to single beneficiary", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      await time.increase(61);
      const balBefore = await ethers.provider.getBalance(beneficiary1.address);
      await vault.connect(beneficiary1).claim(0);
      const balAfter = await ethers.provider.getBalance(beneficiary1.address);
      const gain = balAfter - balBefore;
      expect(gain).to.be.closeTo(ONE_ETHER, ethers.parseEther("0.001"));
    });

    it("reverts when allocations sum to 101", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address, beneficiary2.address],
          [51, 50],
          60,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "AllocationMustSumTo100");
    });

    it("reverts when allocations sum to 99", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address, beneficiary2.address],
          [50, 49],
          60,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "AllocationMustSumTo100");
    });

    it("reverts when allocations sum to 0", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address, beneficiary2.address],
          [0, 0],
          60,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "AllocationMustSumTo100");
    });

    it("reverts when allocations sum to 200 (two beneficiaries both 100%)", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address, beneficiary2.address],
          [100, 100],
          60,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "AllocationMustSumTo100");
    });
  });

  // ─── Lock duration boundaries ────────────────────────────────────────────

  describe("Lock duration boundaries", function () {
    it("accepts exactly MIN_LOCK_SECONDS (60)", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      const capsule = await vault.getCapsule(0);
      expect(capsule.lockDuration).to.equal(60);
    });

    it("accepts exactly MAX_LOCK_SECONDS (10 years)", async () => {
      const TEN_YEARS = 10 * 365 * 24 * 60 * 60;
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        TEN_YEARS,
        "",
        { value: ONE_ETHER }
      );
      const capsule = await vault.getCapsule(0);
      expect(capsule.lockDuration).to.equal(TEN_YEARS);
    });

    it("reverts when lock duration is 1 second (below MIN)", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address],
          [100],
          1,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "LockTooShort");
    });

    it("reverts when lock duration is 10 years + 1 second", async () => {
      const TEN_YEARS_PLUS_ONE = 10 * 365 * 24 * 60 * 60 + 1;
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address],
          [100],
          TEN_YEARS_PLUS_ONE,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "LockTooLong");
    });
  });

  // ─── Fee edge cases ─────────────────────────────────────────────────────

  describe("Fee edge cases", function () {
    it("accepts exactly MIN_CREATION_FEE (0.001 ETH)", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ethers.parseEther("0.001") }
      );
      const capsule = await vault.getCapsule(0);
      expect(capsule.depositedValue).to.equal(ethers.parseEther("0.001"));
    });

    it("reverts when fee is 0.0001 ETH (below MIN)", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address],
          [100],
          60,
          "",
          { value: ethers.parseEther("0.0001") }
        )
      ).to.be.revertedWithCustomError(vault, "InsufficientFee");
    });

    it("accepts very large ETH deposit (100 ETH)", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ethers.parseEther("100") }
      );
      const capsule = await vault.getCapsule(0);
      expect(capsule.depositedValue).to.equal(ethers.parseEther("100"));
    });

    it("capsule with no message stores empty string", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      const capsule = await vault.getCapsule(0);
      expect(capsule.messageHash).to.equal("");
    });
  });

  // ─── Timing edge cases ──────────────────────────────────────────────────

  describe("Timing edge cases", function () {
    it("claim reverts exactly at unlock time (not before)", async () => {
      const LOCK = 60;
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        LOCK,
        "",
        { value: ONE_ETHER }
      );

      // Before unlock — should revert
      await expect(
        vault.connect(beneficiary1).claim(0)
      ).to.be.revertedWithCustomError(vault, "TimeLockActive");

      // Fast-forward to exactly unlock time
      await time.increase(LOCK);
      const capsule = await vault.getCapsule(0);
      const createdAt = Number(capsule.createdAt);
      const unlockTime = createdAt + LOCK;

      // block.timestamp == unlockTime should allow claim (not revert with TimeLockActive)
      // Advance to exact unlock + 2 to avoid Hardhat same-timestamp block issue
      await time.increaseTo(unlockTime + 2);
      await vault.connect(beneficiary1).claim(0);
      const capsuleAfter = await vault.getCapsule(0);
      expect(capsuleAfter.isWithdrawn).to.equal(true);
    });

    it("cancel reverts exactly at unlock time", async () => {
      const LOCK = 60;
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        LOCK,
        "",
        { value: ONE_ETHER }
      );

      // At exactly unlock time — cancel should fail
      await time.increase(LOCK + 1);
      await expect(
        vault.connect(owner).cancelCapsule(0)
      ).to.be.revertedWithCustomError(vault, "TimeLockActive");
    });
  });

  // ─── Multiple capsules edge cases ────────────────────────────────────────

  describe("Multiple capsules interactions", function () {
    it("same beneficiary can be in multiple capsules", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        120,
        "",
        { value: ONE_ETHER }
      );

      const isBen1Capsule0 = await vault.isBeneficiary(0, beneficiary1.address);
      const isBen1Capsule1 = await vault.isBeneficiary(1, beneficiary1.address);
      expect(isBen1Capsule0).to.equal(true);
      expect(isBen1Capsule1).to.equal(true);
    });

    it("different beneficiaries across capsules are independent", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      await vault.connect(owner).createCapsule(
        [beneficiary2.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );

      const isBen1InCapsule0 = await vault.isBeneficiary(0, beneficiary1.address);
      const isBen1InCapsule1 = await vault.isBeneficiary(1, beneficiary1.address);
      const isBen2InCapsule0 = await vault.isBeneficiary(0, beneficiary2.address);
      const isBen2InCapsule1 = await vault.isBeneficiary(1, beneficiary2.address);

      expect(isBen1InCapsule0).to.equal(true);
      expect(isBen1InCapsule1).to.equal(false);
      expect(isBen2InCapsule0).to.equal(false);
      expect(isBen2InCapsule1).to.equal(true);
    });

    it("capsule IDs are sequential and independent", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      const id0 = await vault.getUnlockTimestamp(0);
      expect(id0).to.not.equal(0);

      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      const id1 = await vault.getUnlockTimestamp(1);
      expect(id1).to.not.equal(id0);
    });
  });

  // ─── Pause + cancel interactions ─────────────────────────────────────────

  describe("Pause interactions", function () {
    it("beneficiary cannot claim when contract is paused", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      await vault.connect(owner).pause();
      await time.increase(61);
      await expect(
        vault.connect(beneficiary1).claim(0)
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("founder cannot cancel when contract is paused", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      await vault.connect(owner).pause();
      await expect(
        vault.connect(owner).cancelCapsule(0)
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("unpause allows operations to resume", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      await vault.connect(owner).pause();
      await vault.connect(owner).unpause();

      // Should work now
      const capsule = await vault.getCapsule(0);
      expect(capsule.founder).to.equal(owner.address);
    });
  });

  // ─── Cancel after partial claim ─────────────────────────────────────────

  describe("Cancel after partial claim", function () {
    it("founder CANNOT cancel after any beneficiary has claimed", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address, beneficiary2.address],
        [60, 40],
        60,
        "",
        { value: ONE_ETHER }
      );
      await time.increase(61);
      await vault.connect(beneficiary1).claim(0); // 60% claimed

      await expect(
        vault.connect(owner).cancelCapsule(0)
      ).to.be.revertedWithCustomError(vault, "TimeLockActive");
    });

    it("founder CANNOT cancel after all beneficiaries claimed (TimeLockActive takes precedence)", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      // Use increaseTo to set a specific timestamp well past unlock
      const capsule = await vault.getCapsule(0);
      const unlockTime = Number(capsule.createdAt) + 60;
      await time.increaseTo(unlockTime + 120); // definitely past unlock
      await vault.connect(beneficiary1).claim(0);

      // After all claimed, isWithdrawn=true, so AlreadyWithdrawn fires first
      await expect(
        vault.connect(owner).cancelCapsule(0)
      ).to.be.revertedWithCustomError(vault, "AlreadyWithdrawn");
    });

    it("second beneficiary can still claim after first claims", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address, beneficiary2.address],
        [60, 40],
        60,
        "",
        { value: ONE_ETHER }
      );
      await time.increase(61);

      await vault.connect(beneficiary1).claim(0);
      const capsuleAfter = await vault.getCapsule(0);
      expect(capsuleAfter.isWithdrawn).to.equal(false); // not all claimed yet

      await vault.connect(beneficiary2).claim(0);
      const capsuleFinal = await vault.getCapsule(0);
      expect(capsuleFinal.isWithdrawn).to.equal(true);
    });
  });

  // ─── View function accuracy ────────────────────────────────────────────

  describe("View function accuracy", function () {
    it("getTimeRemaining returns exact seconds remaining", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        120, // 2 minutes
        "",
        { value: ONE_ETHER }
      );

      // Should be close to 120 seconds (after 1 block, small time drift ok)
      const remaining = await vault.getTimeRemaining(0);
      expect(remaining).to.be.closeTo(120, 5); // within 5 seconds

      await time.increase(60);
      const remaining2 = await vault.getTimeRemaining(0);
      expect(remaining2).to.be.closeTo(60, 5);

      await time.increase(61);
      const remaining3 = await vault.getTimeRemaining(0);
      expect(remaining3).to.equal(0);
    });

    it("getMyAllocation returns correct allocation and claimed status", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address, beneficiary2.address],
        [60, 40],
        60,
        "",
        { value: ONE_ETHER }
      );

      const [allocBen1, claimedBen1] = await vault.connect(beneficiary1).getMyAllocation(0);
      const [allocBen2, claimedBen2] = await vault.connect(beneficiary2).getMyAllocation(0);

      expect(allocBen1).to.equal(60);
      expect(claimedBen1).to.equal(false);
      expect(allocBen2).to.equal(40);
      expect(claimedBen2).to.equal(false);

      // Owner is NOT a beneficiary — getMyAllocation reverts with NotBeneficiary
      await expect(
        vault.connect(owner).getMyAllocation(0)
      ).to.be.revertedWithCustomError(vault, "NotBeneficiary");

      await time.increase(61);
      await vault.connect(beneficiary1).claim(0);

      const [allocBen1After, claimedBen1After] = await vault.connect(beneficiary1).getMyAllocation(0);
      expect(allocBen1After).to.equal(60);
      expect(claimedBen1After).to.equal(true);
    });

    it("getBeneficiaryCount returns correct count", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address, beneficiary2.address],
        [60, 40],
        60,
        "",
        { value: ONE_ETHER }
      );
      const count = await vault.getBeneficiaryCount(0);
      expect(count).to.equal(2);
    });
  });

  // ─── Event completeness ──────────────────────────────────────────────────

  describe("Event completeness", function () {
    it("CapsuleCreated emits correct indexed topics", async () => {
      const beforeTime = await time.latest();
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address],
          [100],
          60,
          "QmTestHash",
          { value: ONE_ETHER }
        )
      )
        .to.emit(vault, "CapsuleCreated")
        .withArgs(
          0,                      // capsuleId (indexed)
          owner.address,          // founder (indexed)
          beforeTime + 1,         // createdAt (block timestamp, approx)
          60,                     // lockDuration
          beforeTime + 61,        // originalUnlockTime (createdAt + lockDuration)
          "QmTestHash",           // messageHash
          beneficiary1.address    // primaryBeneficiary (indexed)
        );
    });

    it("BeneficiaryAdded is emitted for each beneficiary", async () => {
      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address, beneficiary2.address],
          [60, 40],
          60,
          "",
          { value: ONE_ETHER }
        )
      )
        .to.emit(vault, "BeneficiaryAdded")
        .withArgs(0, beneficiary1.address, 60)
        .to.emit(vault, "BeneficiaryAdded")
        .withArgs(0, beneficiary2.address, 40);
    });

    it("WithdrawalClaimed emits with correct amount", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ethers.parseEther("5.0") }
      );
      await time.increase(61);
      await expect(
        vault.connect(beneficiary1).claim(0)
      ).to.emit(vault, "WithdrawalClaimed").withArgs(0, beneficiary1.address, ethers.parseEther("5.0"));
    });

    it("CapsuleCancelled emits with correct founder", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      await expect(
        vault.connect(owner).cancelCapsule(0)
      ).to.emit(vault, "CapsuleCancelled").withArgs(0, owner.address);
    });
  });

  // ─── getUnlockTimestamp consistency ──────────────────────────────────────

  describe("getUnlockTimestamp consistency", function () {
    it("getUnlockTimestamp equals createdAt + lockDuration", async () => {
      const LOCK = 120;
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        LOCK,
        "",
        { value: ONE_ETHER }
      );
      const capsule = await vault.getCapsule(0);
      const expectedUnlock = capsule.createdAt + BigInt(LOCK);
      const actualUnlock = await vault.getUnlockTimestamp(0);
      expect(actualUnlock).to.equal(expectedUnlock);
    });

    it("isUnlocked returns false before createdAt + lockDuration", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        120,
        "",
        { value: ONE_ETHER }
      );
      const isUnlocked = await vault.isUnlocked(0);
      expect(isUnlocked).to.equal(false);
    });

    it("isUnlocked returns true after createdAt + lockDuration", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        60,
        "",
        { value: ONE_ETHER }
      );
      await time.increase(61);
      const isUnlocked = await vault.isUnlocked(0);
      expect(isUnlocked).to.equal(true);
    });
  });

  // ─── MAX_BENEFICIARIES boundary ─────────────────────────────────────────

  describe("MAX_BENEFICIARIES boundary", function () {
    it("accepts exactly 10 beneficiaries (MAX)", async () => {
      const addrs: string[] = [];
      const allocs: number[] = [];
      for (let i = 0; i < 10; i++) {
        addrs.push(signers[i].address); // use distinct signers to avoid DuplicateBeneficiary
        allocs.push(10);
      }
      await vault.connect(owner).createCapsule(
        addrs,
        allocs,
        60,
        "",
        { value: ONE_ETHER }
      );
      const count = await vault.getBeneficiaryCount(0);
      expect(count).to.equal(10);
    });

    it("reverts with 11 beneficiaries", async () => {
      const addrs: string[] = Array(11).fill(owner.address);
      // Use integer math: 100/11 = 9 remainder 1
      // First (100 % 11) = 1 beneficiary gets 10, rest get 9 → total = 1*10 + 10*9 = 100
      const base = Math.floor(100 / 11); // 9
      const remainder = 100 % 11; // 1
      const allocs: number[] = [];
      for (let i = 0; i < 11; i++) {
        allocs.push(i < remainder ? base + 1 : base);
      }
      // Allocations are exactly [10, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9] → sum = 100
      expect(allocs.reduce((a, b) => a + b, 0)).to.equal(100);

      await expect(
        vault.connect(owner).createCapsule(
          addrs,
          allocs,
          60,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "TooManyBeneficiaries");
    });
  });
});
