import { expect } from "chai";
import { ethers } from "hardhat";
import type { TimeCapsuleVault } from "../typechain-types";

describe("TimeCapsuleVault — capsules() vs getCapsule()", function () {
  let vault: TimeCapsuleVault;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let beneficiary1: Awaited<ReturnType<typeof ethers.getSigners>>[1];
  let beneficiary2: Awaited<ReturnType<typeof ethers.getSigners>>[2];

  const SEVEN_DAYS = 7 * 24 * 60 * 60;

  beforeEach(async () => {
    [owner, beneficiary1, beneficiary2] = await ethers.getSigners();
    const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
    vault = await VaultFactory.deploy() as TimeCapsuleVault;
    await vault.waitForDeployment();
  });

  it("capsules() returns correct 5-field tuple", async () => {
    const DEPOSIT = ethers.parseEther("0.5");
    await vault.connect(owner).createCapsule(
      [beneficiary1.address, beneficiary2.address],
      [60, 40],
      SEVEN_DAYS,
      "QmTestHash123",
      { value: DEPOSIT }
    );

    // capsules() returns (address, uint256, bool, string, uint256)
    const capsuleTuple = await vault.capsules(0);

    // Field 0: founder address
    expect(capsuleTuple[0]).to.equal(owner.address);
    // Field 1: unlockTimestamp (should be in the future)
    expect(capsuleTuple[1]).to.be.greaterThan(0);
    // Field 2: isWithdrawn
    expect(capsuleTuple[2]).to.equal(false);
    // Field 3: messageHash
    expect(capsuleTuple[3]).to.equal("QmTestHash123");
    // Field 4: depositedValue — THIS IS THE CRITICAL FIELD for frontend
    expect(capsuleTuple[4]).to.equal(DEPOSIT);
  });

  it("capsules() depositedValue matches actual deposit", async () => {
    const DEPOSIT_1 = ethers.parseEther("2.5");
    const DEPOSIT_2 = ethers.parseEther("0.123");

    // Capsule 0: 2.5 ETH
    await vault.connect(owner).createCapsule(
      [beneficiary1.address],
      [100],
      SEVEN_DAYS,
      "",
      { value: DEPOSIT_1 }
    );

    // Capsule 1: 0.123 ETH
    await vault.connect(owner).createCapsule(
      [beneficiary2.address],
      [100],
      SEVEN_DAYS,
      "",
      { value: DEPOSIT_2 }
    );

    const capsule0 = await vault.capsules(0);
    const capsule1 = await vault.capsules(1);

    expect(capsule0[4]).to.equal(DEPOSIT_1);
    expect(capsule1[4]).to.equal(DEPOSIT_2);
  });
});
