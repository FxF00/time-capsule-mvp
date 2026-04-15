import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { TimeCapsuleVault } from "../typechain-types";

describe("TimeCapsuleVault — multiple capsules", function () {
  let vault: TimeCapsuleVault;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let beneficiary1: Awaited<ReturnType<typeof ethers.getSigners>>[1];
  let beneficiary2: Awaited<ReturnType<typeof ethers.getSigners>>[2];

  const SEVEN_DAYS = 7 * 24 * 60 * 60;
  const THIRTY_DAYS = 30 * 24 * 60 * 60;

  beforeEach(async () => {
    [owner, beneficiary1, beneficiary2] = await ethers.getSigners();
    const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
    vault = await VaultFactory.deploy() as TimeCapsuleVault;
    await vault.waitForDeployment();
  });

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
