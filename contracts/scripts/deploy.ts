import { ethers } from "hardhat";

async function main() {
  const TimeCapsuleVault = await ethers.getContractFactory("TimeCapsuleVault");
  const vault = await TimeCapsuleVault.deploy();
  await vault.waitForDeployment();
  const address = await vault.getAddress();
  console.log("TimeCapsuleVault deployed to:", address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
