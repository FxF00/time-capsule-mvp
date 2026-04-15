import { expect } from "chai";
import { ethers } from "hardhat";
import type { TimeCapsuleVault } from "../typechain-types";

describe("TimeCapsuleVault — beneficiary lookups", function () {
  let vault: TimeCapsuleVault;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let beneficiary1: Awaited<ReturnType<typeof ethers.getSigners>>[1];
  let beneficiary2: Awaited<ReturnType<typeof ethers.getSigners>>[2];
  let stranger: Awaited<ReturnType<typeof ethers.getSigners>>[3];

  const SEVEN_DAYS = 7 * 24 * 60 * 60;

  beforeEach(async () => {
    [owner, beneficiary1, beneficiary2, stranger] = await ethers.getSigners();
    const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
    vault = await VaultFactory.deploy() as TimeCapsuleVault;
    await vault.waitForDeployment();

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
