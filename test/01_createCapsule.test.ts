import { expect } from "chai";
import { ethers } from "hardhat";
import type { TimeCapsuleVault } from "../typechain-types";

describe("TimeCapsuleVault — createCapsule", function () {
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

  it("creates a capsule with correct unlock timestamp", async () => {
    const before = (await ethers.provider.getBlock("latest"))!.timestamp;
    const tx = await vault.connect(owner).createCapsule(
      [beneficiary1.address],
      [100],
      SEVEN_DAYS,
      "QmTestHash",
      { value: ONE_ETHER }
    );
    const after = (await ethers.provider.getBlock("latest"))!.timestamp;
    await tx.wait();

    const capsule = await vault.getCapsule(0);
    expect(capsule.founder).to.equal(owner.address);
    expect(capsule.unlockTimestamp).to.be.greaterThan(before + SEVEN_DAYS - 5);
    expect(capsule.unlockTimestamp).to.be.lessThanOrEqual(after + SEVEN_DAYS + 5);
    expect(capsule.isWithdrawn).to.equal(false);
    expect(capsule.messageHash).to.equal("QmTestHash");
    expect(capsule.depositedValue).to.equal(ONE_ETHER);
  });

  it("stores multiple beneficiaries with correct allocations", async () => {
    const tx = await vault.connect(owner).createCapsule(
      [beneficiary1.address, beneficiary2.address],
      [60, 40],
      SEVEN_DAYS,
      "",
      { value: ONE_ETHER }
    );
    await tx.wait();

    const count = await vault.getBeneficiaryCount(0);
    expect(count).to.equal(2);

    const vaultAsB1 = vault.connect(beneficiary1);
    const vaultAsB2 = vault.connect(beneficiary2);

    const [alloc1, claimed1] = await vaultAsB1.getMyAllocation(0);
    expect(alloc1).to.equal(60);
    expect(claimed1).to.equal(false);

    const [alloc2, claimed2] = await vaultAsB2.getMyAllocation(0);
    expect(alloc2).to.equal(40);
    expect(claimed2).to.equal(false);
  });

  it("reverts if no beneficiaries", async () => {
    await expect(
      vault.connect(owner).createCapsule([], [], SEVEN_DAYS, "", { value: ONE_ETHER })
    ).to.be.revertedWithCustomError(vault, "ZeroAddress");
  });

  it("reverts if arrays length mismatch", async () => {
    await expect(
      vault.connect(owner).createCapsule(
        [beneficiary1.address, beneficiary2.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      )
    ).to.be.revertedWithCustomError(vault, "MismatchLength");
  });

  it("reverts if allocations don't sum to 100", async () => {
    await expect(
      vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [50],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      )
    ).to.be.revertedWithCustomError(vault, "AllocationMustSumTo100");
  });

  it("reverts if lock duration is too short", async () => {
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

  it("reverts if lock duration is 59 seconds (just below MIN_LOCK_SECONDS)", async () => {
    await expect(
      vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        59,
        "",
        { value: ONE_ETHER }
      )
    ).to.be.revertedWithCustomError(vault, "LockTooShort");
  });

  it("accepts lock duration of exactly 60 seconds (MIN_LOCK_SECONDS boundary)", async () => {
    const tx = await vault.connect(owner).createCapsule(
      [beneficiary1.address],
      [100],
      60,
      "",
      { value: ONE_ETHER }
    );
    await expect(tx).to.not.be.reverted;
  });

  it("accepts lock duration of 61 seconds (just above MIN_LOCK_SECONDS)", async () => {
    const tx = await vault.connect(owner).createCapsule(
      [beneficiary1.address],
      [100],
      61,
      "",
      { value: ONE_ETHER }
    );
    await expect(tx).to.not.be.reverted;
  });

  it("reverts if lock duration exceeds 10 years", async () => {
    await expect(
      vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        11 * 365 * 24 * 60 * 60,
        "",
        { value: ONE_ETHER }
      )
    ).to.be.revertedWithCustomError(vault, "LockTooLong");
  });

  it("reverts if insufficient creation fee", async () => {
    await expect(
      vault.connect(owner).createCapsule(
        [beneficiary1.address],
        [100],
        SEVEN_DAYS,
        "",
        { value: ethers.parseEther("0.0001") }
      )
    ).to.be.revertedWithCustomError(vault, "InsufficientFee");
  });

  it("reverts if beneficiary address is zero", async () => {
    await expect(
      vault.connect(owner).createCapsule(
        ["0x0000000000000000000000000000000000000000"],
        [100],
        SEVEN_DAYS,
        "",
        { value: ONE_ETHER }
      )
    ).to.be.revertedWithCustomError(vault, "ZeroAddress");
  });

  it("accepts ETH payment and stores balance", async () => {
    await vault.connect(owner).createCapsule(
      [beneficiary1.address],
      [100],
      SEVEN_DAYS,
      "",
      { value: ONE_ETHER }
    );
    const balance = await ethers.provider.getBalance(await vault.getAddress());
    expect(balance).to.equal(ONE_ETHER);
  });

  it("emits CapsuleCreated and BeneficiaryAdded events", async () => {
    const tx = await vault.connect(owner).createCapsule(
      [beneficiary1.address, beneficiary2.address],
      [60, 40],
      SEVEN_DAYS,
      "QmHash",
      { value: ONE_ETHER }
    );
    const receipt = await tx.wait();

    const capsuleEvent = receipt.logs.find((l: any) =>
      l.fragment?.name === "CapsuleCreated"
    );
    expect(capsuleEvent).to.not.be.undefined;
    expect(capsuleEvent!.args.capsuleId).to.equal(0);
    expect(capsuleEvent!.args.founder).to.equal(owner.address);

    const capsule = await vault.capsules(0);
    expect(capsule.depositedValue).to.equal(ONE_ETHER);

    const addEvents = receipt.logs.filter((l: any) =>
      l.fragment?.name === "BeneficiaryAdded"
    );
    expect(addEvents.length).to.equal(2);
  });

  it("CapsuleCreated event stores capsuleId in topics[1] (indexed parameter)", async () => {
    const tx = await vault.connect(owner).createCapsule(
      [beneficiary1.address],
      [100],
      SEVEN_DAYS,
      "QmHash",
      { value: ethers.parseEther("1.0") }
    );
    const receipt = await tx.wait();

    const capsuleEvent = receipt.logs.find((l: any) =>
      l.fragment?.name === "CapsuleCreated"
    );
    expect(capsuleEvent).to.not.be.undefined;

    const capsuleIdFromTopic = BigInt(capsuleEvent!.topics[1]);
    expect(capsuleIdFromTopic).to.equal(0n);
  });

  it("CapsuleCreated event stores founder in topics[2] (indexed parameter)", async () => {
    const tx = await vault.connect(owner).createCapsule(
      [beneficiary1.address],
      [100],
      SEVEN_DAYS,
      "QmHash",
      { value: ethers.parseEther("1.0") }
    );
    const receipt = await tx.wait();

    const capsuleEvent = receipt.logs.find((l: any) =>
      l.fragment?.name === "CapsuleCreated"
    );
    expect(capsuleEvent).to.not.be.undefined;

    const founderFromTopic = capsuleEvent!.topics[2];
    const founderAddress = "0x" + founderFromTopic.slice(26);
    expect(founderAddress.toLowerCase()).to.equal(owner.address.toLowerCase());
  });
});
