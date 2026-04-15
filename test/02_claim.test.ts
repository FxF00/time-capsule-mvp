import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { TimeCapsuleVault } from "../typechain-types";

describe("TimeCapsuleVault — claim", function () {
  let vault: TimeCapsuleVault;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let beneficiary1: Awaited<ReturnType<typeof ethers.getSigners>>[1];
  let beneficiary2: Awaited<ReturnType<typeof ethers.getSigners>>[2];
  let stranger: Awaited<ReturnType<typeof ethers.getSigners>>[3];

  const SEVEN_DAYS = 7 * 24 * 60 * 60;
  const ONE_ETHER = ethers.parseEther("1.0");

  beforeEach(async () => {
    [owner, beneficiary1, beneficiary2, stranger] = await ethers.getSigners();
    const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
    vault = await VaultFactory.deploy() as TimeCapsuleVault;
    await vault.waitForDeployment();

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
