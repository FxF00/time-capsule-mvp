import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const DEPLOYMENTS_FILE = path.join(__dirname, "deployments.json");

interface Deployment {
  network: string;
  vault: string;
  timestamp: string;
}

function loadDeployments(): Record<string, Deployment> {
  if (fs.existsSync(DEPLOYMENTS_FILE)) {
    return JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf-8"));
  }
  return {};
}

function saveDeployment(networkName: string, vaultAddress: string) {
  const deps = loadDeployments();
  deps[networkName] = {
    network: networkName,
    vault: vaultAddress,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(deps, null, 2));
  console.log(`Deployment saved to ${DEPLOYMENTS_FILE}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  console.log("========================================");
  console.log("TimeCapsuleVault Deployment");
  console.log("========================================");
  console.log(`Network:      ${networkName}`);
  console.log(`Deployer:     ${deployer.address}`);
  console.log(`Balance:     ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log("========================================\n");

  // Deploy TimeCapsuleVault (no constructor args)
  const VaultFactory = await ethers.getContractFactory("TimeCapsuleVault");
  const vault = await VaultFactory.deploy();
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log(`TimeCapsuleVault deployed to: ${vaultAddress}`);

  // Save deployment info
  saveDeployment(networkName, vaultAddress);

  // Print verification commands
  console.log("\n========================================");
  console.log("Verification Commands");
  console.log("========================================");
  if (networkName === "mumbai") {
    console.log(`npx hardhat run scripts/verify.ts --network mumbai`);
  } else if (networkName === "polygon") {
    console.log(`npx hardhat run scripts/verify.ts --network polygon`);
  } else if (networkName === "amoy") {
    console.log(`npx hardhat run scripts/verify.ts --network amoy`);
  } else {
    console.log("(Verification not needed for this network)");
  }

  console.log("\nDone!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
