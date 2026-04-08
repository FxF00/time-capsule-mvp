import { network, ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const DEPLOYMENTS_FILE = path.join(__dirname, "deployments.json");

interface Deployment {
  network: string;
  vault: string;
  timestamp: string;
}

function loadDeployment(): Deployment | null {
  if (!fs.existsSync(DEPLOYMENTS_FILE)) {
    return null;
  }
  const deps: Record<string, Deployment> = JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf-8"));
  return deps[network.name] || null;
}

async function main() {
  const networkName = network.name;
  const deployment = loadDeployment();

  if (!deployment) {
    console.error(`No deployment found for network: ${networkName}`);
    console.error("Run scripts/deploy.ts first.");
    process.exit(1);
  }

  console.log("========================================");
  console.log("TimeCapsuleVault Verification");
  console.log("========================================");
  console.log(`Network:     ${networkName}`);
  console.log(`Vault:       ${deployment.vault}`);
  console.log(`Deployed:    ${deployment.timestamp}`);
  console.log("========================================\n");

  // Verify contract on Polygonscan (using hardhat-verify plugin)
  try {
    console.log("Verifying contract on Polygonscan...");
    await hre.run("verify:verify", {
      address: deployment.vault,
      constructorArguments: [], // TimeCapsuleVault has no constructor args
    });
    console.log("\nContract verified successfully!");
  } catch (err: any) {
    // If already verified or Polygonscan is throttling, continue
    if (err.message?.includes("Already verified") || err.message?.includes("rate limit")) {
      console.log("Contract already verified or rate limited. Skipping.");
    } else {
      console.error("Verification failed:", err.message);
      console.error("You may need to wait a few minutes before verification works.");
    }
  }

  console.log("\nDone!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
