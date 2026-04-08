import { ethers } from "ethers";

// Contract address — set via VITE_CONTRACT_ADDRESS env var
export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000001";

// Minimal ABI for TimeCapsuleVault
export const VAULT_ABI = [
  // Capsule struct: founder, unlockTimestamp, isWithdrawn, messageHash, depositedValue
  // Read struct fields
  "function capsules(uint256) view returns (address, uint256, bool, string, uint256)",
  "function beneficiaryIndices(uint256, address) view returns (uint256)",
  // State
  "function isBeneficiary(uint256, address) view returns (bool)",
  // Core
  "function createCapsule(address[] calldata, uint256[] calldata, uint256, string calldata) external payable returns (uint256)",
  "function claim(uint256) external",
  "function cancelCapsule(uint256) external",
  // Views
  "function getCapsule(uint256) view returns (tuple(address founder, uint256 unlockTimestamp, bool isWithdrawn, string messageHash, uint256 depositedValue))",
  "function getBeneficiaryCount(uint256) view returns (uint256)",
  "function getMyAllocation(uint256) view returns (uint256, bool)",
  "function isUnlocked(uint256) view returns (bool)",
  "function getTimeRemaining(uint256) view returns (uint256)",
  // Admin
  "function pause() external",
  "function unpause() external",
  // Events (for decoding)
  "event CapsuleCreated(uint256 indexed, address indexed, uint256, uint256, string)",
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
};

export function getVaultContract(provider: ethers.ContractRunner) {
  return new ethers.Contract(CONTRACT_ADDRESS, VAULT_ABI, provider);
}
