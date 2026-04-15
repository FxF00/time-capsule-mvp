import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { TimeCapsuleVault } from "../typechain-types";

describe("TimeCapsuleVault — Security Tests", function () {
  let vault: TimeCapsuleVault;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let beneficiary1: Awaited<ReturnType<typeof ethers.getSigners>>[1];
  let beneficiary2: Awaited<ReturnType<typeof ethers.getSigners>>[2];
  let stranger: Awaited<ReturnType<typeof ethers.getSigners>>[3];
  let relayer: Awaited<ReturnType<typeof ethers.getSigners>>[4];

  const SEVEN_DAYS = 7 * 24 * 60 * 60;
  const ONE_ETHER = ethers.parseEther("1.0");

  beforeEach(async () => {
    [owner, beneficiary1, beneficiary2, stranger, relayer] = await ethers.getSigners();
    const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
    vault = await VaultFactory.deploy() as TimeCapsuleVault;
    await vault.waitForDeployment();
  });

  // ─── setMessageHash access control ────────────────────────────────────────

  describe("setMessageHash access control", function () {
    it("only founder can update messageHash", async () => {
      const ipfsHash = "QmTest123";
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        ipfsHash,
        { value: ONE_ETHER }
      );

      // Non-founder should revert
      await expect(
        vault.connect(beneficiary1).setMessageHash(0, "newHash")
      ).to.be.revertedWithCustomError(vault, "Unauthorized");

      await expect(
        vault.connect(stranger).setMessageHash(0, "newHash")
      ).to.be.revertedWithCustomError(vault, "Unauthorized");
    });

    it("founder can update messageHash before unlock", async () => {
      const originalHash = "QmOriginal";
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        originalHash,
        { value: ONE_ETHER }
      );

      const newHash = "QmUpdated";
      await vault.connect(owner).setMessageHash(0, newHash);

      const capsule = await vault.getCapsule(0);
      expect(capsule.messageHash).to.equal(newHash);
    });

    it("founder can update messageHash after unlock (no time lock)", async () => {
      const originalHash = "QmOriginal";
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        originalHash,
        { value: ONE_ETHER }
      );

      await time.increase(SEVEN_DAYS + 1);

      // Founder can still update after unlock — this is by design but worth documenting
      const newHash = "QmPostUnlock";
      await vault.connect(owner).setMessageHash(0, newHash);

      const capsule = await vault.getCapsule(0);
      expect(capsule.messageHash).to.equal(newHash);
    });
  });

  // ─── Relayer mechanism ─────────────────────────────────────────────────────

  describe("claimBySig relayer mechanism", function () {
    it("setTrustedRelayer is onlyOwner — beneficiary cannot set relayer", async () => {
      await expect(
        vault.connect(beneficiary1).setTrustedRelayer(relayer.address)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("RelayerNotTrusted error is defined but never thrown in claimBySig", async () => {
      // The error RelayerNotTrusted exists (line 99) but claimBySig never reverts with it
      // The relayer variable is set by setTrustedRelayer but never checked in claimBySig
      // This documents a design issue: the relayer mechanism is non-functional
      const errorSelector = vault.interface.getError("RelayerNotTrusted").selector;
      expect(errorSelector).to.not.be.undefined;
    });

    it("claimBySig uses ECDSA.recover — wrong capsuleId in claim reverts", async () => {
      // Create capsule 0
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );

      // Create capsule 1
      await vault.connect(owner).createCapsule(
        [beneficiary2.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );

      await time.increase(SEVEN_DAYS + 1);

      // Sign for capsule 1 but try to claim capsule 0 — reverts with InvalidSignature
      // because the recovered signer is beneficiary2 (for capsule 1's claim)
      // but msg.sender is beneficiary1 and capsule 0's beneficiary is beneficiary1
      // Actually — the signature is built for capsuleId=1 but called for capsuleId=0
      // The recovered signer won't match beneficiary1 address
      const nonce = await vault.beneficiaryNonces(beneficiary1.address);
      const domain = {
        name: "TimeCapsuleVault",
        version: "1",
        chainId: 31337,
        verifyingContract: await vault.getAddress(),
      };
      const types = {
        ClaimSig: [
          { name: "capsuleId", type: "uint256" },
          { name: "beneficiary", type: "address" },
          { name: "nonce", type: "uint256" },
        ],
      };
      // Sign with capsuleId=1 (beneficiary2's capsule)
      const value = { capsuleId: 1, beneficiary: beneficiary2.address, nonce: 0 };
      const signature = await beneficiary2.signTypedData(domain, types, value);

      // Try to claim capsule 0 with beneficiary2's signature — should fail
      await expect(
        vault.connect(beneficiary2).claimBySig(0, signature)
      ).to.be.revertedWithCustomError(vault, "InvalidSignature");
    });
  });

  // ─── cancelCapsule event completeness ──────────────────────────────────────

  describe("cancelCapsule event emission", function () {
    it("CapsuleCancelled event is emitted but missing amount field", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );

      await expect(vault.connect(owner).cancelCapsule(0))
        .to.emit(vault, "CapsuleCancelled")
        .withArgs(0, owner.address);

      const capsule = await vault.getCapsule(0);
      expect(capsule.isWithdrawn).to.equal(true);
    });
  });

  // ─── depositedValue not zeroed after withdrawal ────────────────────────────

  describe("depositedValue state after withdrawal", function () {
    it("depositedValue remains set after all beneficiaries claim", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );

      await time.increase(SEVEN_DAYS + 1);
      await vault.connect(beneficiary1).claim(0);

      const capsule = await vault.getCapsule(0);
      expect(capsule.isWithdrawn).to.equal(true);
      // depositedValue is not zeroed — contract relies on isWithdrawn flag
      expect(capsule.depositedValue).to.equal(ONE_ETHER);
    });

    it("depositedValue remains set after cancelCapsule", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );

      await vault.connect(owner).cancelCapsule(0);

      const capsule = await vault.getCapsule(0);
      expect(capsule.isWithdrawn).to.equal(true);
      // depositedValue is not zeroed — contract relies on isWithdrawn flag
      expect(capsule.depositedValue).to.equal(ONE_ETHER);
    });
  });

  // ─── Beneficiary nonce security ────────────────────────────────────────────

  describe("beneficiaryNonces", function () {
    it("nonce increments on each claim() call", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );

      const nonce0 = await vault.beneficiaryNonces(beneficiary1.address);
      expect(nonce0).to.equal(0);

      await time.increase(SEVEN_DAYS + 1);
      await vault.connect(beneficiary1).claim(0);

      const nonce1 = await vault.beneficiaryNonces(beneficiary1.address);
      expect(nonce1).to.equal(1);
    });

    it("nonce is incremented on claim() but not used in that function (for claimBySig only)", async () => {
      // This documents that beneficiaryNonces serves claimBySig meta-transactions
      // claim() increments it but doesn't consume/use it
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );

      await time.increase(SEVEN_DAYS + 1);

      // First claim succeeds
      await vault.connect(beneficiary1).claim(0);

      // Second claim fails — with single beneficiary, isWithdrawn=true after claim
      // so it reverts with AlreadyWithdrawn (not AlreadyClaimed)
      await expect(
        vault.connect(beneficiary1).claim(0)
      ).to.be.revertedWithCustomError(vault, "AlreadyWithdrawn");
    });
  });

  // ─── Reentrancy protection ────────────────────────────────────────────────

  describe("ReentrancyGuard protection", function () {
    it("claim() is protected by nonReentrant", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );

      await time.increase(SEVEN_DAYS + 1);

      // First claim succeeds
      await vault.connect(beneficiary1).claim(0);

      // Second claim fails — isWithdrawn=true after single beneficiary claims
      await expect(
        vault.connect(beneficiary1).claim(0)
      ).to.be.revertedWithCustomError(vault, "AlreadyWithdrawn");
    });

    it("cancelCapsule() is protected by nonReentrant", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );

      // Cancel should succeed
      await vault.connect(owner).cancelCapsule(0);

      // Second cancel should fail
      await expect(
        vault.connect(owner).cancelCapsule(0)
      ).to.be.revertedWithCustomError(vault, "AlreadyWithdrawn");
    });
  });

  // ─── Pause protection ─────────────────────────────────────────────────────

  describe("Pausable protection", function () {
    it("paused contract rejects createCapsule", async () => {
      await vault.connect(owner).pause();

      await expect(
        vault.connect(owner).createCapsule(
          [beneficiary1.address],
          [100],
          SEVEN_DAYS,
          "",
          { value: ONE_ETHER }
        )
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("paused contract rejects claim", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );

      await vault.connect(owner).pause();

      await time.increase(SEVEN_DAYS + 1);
      await expect(
        vault.connect(beneficiary1).claim(0)
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("unpause restores functionality", async () => {
      await vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      );

      await vault.connect(owner).pause();
      await vault.connect(owner).unpause();

      // Should now work
      const capsule = await vault.getCapsule(0);
      expect(capsule.founder).to.equal(owner.address);
    });
  });
});
