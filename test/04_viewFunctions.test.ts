import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { TimeCapsuleVault } from "../typechain-types";

describe("TimeCapsuleVault — view functions", function () {
  let vault: TimeCapsuleVault;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let beneficiary1: Awaited<ReturnType<typeof ethers.getSigners>>[1];

  const SEVEN_DAYS = 7 * 24 * 60 * 60;

  beforeEach(async () => {
    [owner, beneficiary1] = await ethers.getSigners();
    const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
    vault = await VaultFactory.deploy() as TimeCapsuleVault;
    await vault.waitForDeployment();

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
