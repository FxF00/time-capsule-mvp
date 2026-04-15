import { expect } from "chai";
import { ethers } from "hardhat";
import type { TimeCapsuleVault } from "../typechain-types";

describe("TimeCapsuleVault — messageHash storage", function () {
  let vault: TimeCapsuleVault;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let beneficiary1: Awaited<ReturnType<typeof ethers.getSigners>>[1];

  const SEVEN_DAYS = 7 * 24 * 60 * 60;

  beforeEach(async () => {
    [owner, beneficiary1] = await ethers.getSigners();
    const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
    vault = await VaultFactory.deploy() as TimeCapsuleVault;
    await vault.waitForDeployment();
  });

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
