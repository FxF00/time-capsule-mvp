import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { TimeCapsuleVault } from "../typechain-types";

describe("TimeCapsuleVault — pause and unpause", function () {
  let vault: TimeCapsuleVault;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let beneficiary1: Awaited<ReturnType<typeof ethers.getSigners>>[1];
  let stranger: Awaited<ReturnType<typeof ethers.getSigners>>[3];

  const SEVEN_DAYS = 7 * 24 * 60 * 60;

  beforeEach(async () => {
    [owner, beneficiary1, , stranger] = await ethers.getSigners();
    const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
    vault = await VaultFactory.deploy() as TimeCapsuleVault;
    await vault.waitForDeployment();
  });

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
    ).to.be.reverted; // Pausable: paused
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
