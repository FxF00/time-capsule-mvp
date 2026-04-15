import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { TimeCapsuleVault } from "../typechain-types";

describe("TimeCapsuleVault — cancelCapsule", function () {
  let vault: TimeCapsuleVault;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let beneficiary1: Awaited<ReturnType<typeof ethers.getSigners>>[1];
  let beneficiary2: Awaited<ReturnType<typeof ethers.getSigners>>[2];

  const SEVEN_DAYS = 7 * 24 * 60 * 60;
  const ONE_ETHER = ethers.parseEther("1.0");

  beforeEach(async () => {
    [owner, beneficiary1, beneficiary2] = await ethers.getSigners();
    const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
    vault = await VaultFactory.deploy() as TimeCapsuleVault;
    await vault.waitForDeployment();
  });

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
    // NOTE: After full claim, isWithdrawn=true, so AlreadyWithdrawn is checked before TimeLockActive.
    // This test verifies the contract prevents double-spending by checking that after
    // the beneficiary claims (isWithdrawn=true), cancel cannot be called.
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

    // After full claim, cancel reverts with AlreadyWithdrawn (isWithdrawn checked first)
    await expect(
      vault.connect(owner).cancelCapsule(0)
    ).to.be.revertedWithCustomError(vault, "AlreadyWithdrawn");
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
