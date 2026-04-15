import { ethers } from "ethers";

// Contract address — set via VITE_CONTRACT_ADDRESS env var
export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000001";

// Minimal ABI for TimeCapsuleVault
// NOTE: Capsule struct has dynamic beneficiaries[] array. The auto-getter capsules(id)
// returns keccak256 hashes for string fields, NOT the actual strings.
// Use the manual getCapsule(uint256) returns (Capsule memory) function instead.
// Duration-only approach: unlockTimestamp = createdAt + lockDuration (no drift)
// Duration-only approach: unlockTimestamp = createdAt + lockDuration (no drift)
export const VAULT_ABI = [
  // Manual getter that returns full Capsule struct (memory) — use this, NOT the auto-getter
  // Auto-getter corrupts string fields (returns keccak256 instead of actual string).
  // Manual getCapsule(uint256) returns (Capsule memory) gives correct values.
  "function getCapsule(uint256) view returns ((address, uint256, bool, string, uint256[], uint256, uint256, uint256, uint256, address))",
  // (founder, unlockTimestamp, isWithdrawn, messageHash, beneficiaries, depositedValue, createdAt, lockDuration, originalUnlockTime, primaryBeneficiary)
  // Beneficiary lookups
  "function beneficiaryIndices(uint256, address) view returns (uint256)",
  "function isBeneficiary(uint256, address) view returns (bool)",
  "function beneficiaryNonces(address) view returns (uint256)",
  // Core
  "function createCapsule(address[] calldata, uint256[] calldata, uint256 lockDuration, string calldata) external payable returns (uint256)",
  "function claim(uint256) external",
  "function cancelCapsule(uint256) external",
  "function setMessageHash(uint256 capsuleId, string calldata messageHash) external",
  // Views
  "function getBeneficiaryCount(uint256) view returns (uint256)",
  "function getMyAllocation(uint256) view returns (uint256, bool)",
  "function isUnlocked(uint256) view returns (bool)",
  "function getTimeRemaining(uint256) view returns (uint256)",
  "function getUnlockTimestamp(uint256) view returns (uint256)",
  // Admin
  "function pause() external",
  "function unpause() external",
  // Events (for decoding)
  "event CapsuleCreated(uint256 indexed, address indexed, uint256, uint256, uint256, string, address indexed)",
  // capsuleId, founder, createdAt, lockDuration, originalUnlockTime, messageHash, primaryBeneficiary
  "event BeneficiaryAdded(uint256 indexed, address indexed, uint256)",
  "event WithdrawalClaimed(uint256 indexed, address indexed, uint256)",
  "event CapsuleCancelled(uint256 indexed, address indexed)",
] as const;

export type Capsule = {
  founder: string;
  unlockTimestamp: bigint;
  isWithdrawn: boolean;
  messageHash: string;
  depositedValue: bigint;
  createdAt: bigint;
  lockDuration: bigint;
};

export function getVaultContract(provider: ethers.ContractRunner) {
  return new ethers.Contract(CONTRACT_ADDRESS, VAULT_ABI, provider);
}

export interface GasEstimate {
  estimate: bigint;
  costEth: number;
  success: true;
}

export interface GasEstimateError {
  success: false;
  error: string;
}

export type GasEstimateResult = GasEstimate | GasEstimateError;

export async function estimateGas(
  signer: ethers.JsonRpcSigner,
  fn: any,
  args: any[],
  txOptions?: any
): Promise<GasEstimateResult> {
  try {
    const estimate = await fn.estimateGas(...args, txOptions || {});
    const feeData = await signer.provider!.getFeeData();
    const gasPrice = feeData.gasPrice || BigInt(0);
    const costEth = Number(ethers.formatEther(estimate * gasPrice));
    return { estimate, costEth, success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Gas estimation failed" };
  }
}
