import { ethers } from "ethers";

// Contract address — set via VITE_CONTRACT_ADDRESS env var
export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000001";

// Minimal ABI for TimeCapsuleVault
export const VAULT_ABI = [
  "function getCapsule(uint256) view returns ((address, uint256, bool, string, uint256[], uint256, uint256, uint256, uint256, address))",
  "function beneficiaryIndices(uint256, address) view returns (uint256)",
  "function isBeneficiary(uint256, address) view returns (bool)",
  "function beneficiaryNonces(address) view returns (uint256)",
  "function createCapsule(address[] calldata, uint256[] calldata, uint256 lockDuration, string calldata) external payable returns (uint256)",
  "function claim(uint256) external",
  "function cancelCapsule(uint256) external",
  "function setMessageHash(uint256 capsuleId, string calldata messageHash) external",
  "function getBeneficiaryCount(uint256) view returns (uint256)",
  "function getMyAllocation(uint256) view returns (uint256, bool)",
  "function isUnlocked(uint256) view returns (bool)",
  "function getTimeRemaining(uint256) view returns (uint256)",
  "function getUnlockTimestamp(uint256) view returns (uint256)",
  "function pause() external",
  "function unpause() external",
  "event CapsuleCreated(uint256 indexed, address indexed, uint256, uint256, uint256, string, address indexed)",
  "event BeneficiaryAdded(uint256 indexed, address indexed, uint256)",
  "event WithdrawalClaimed(uint256 indexed, address indexed, uint256)",
  "event CapsuleCancelled(uint256 indexed, address indexed)",
] as const;

export function getVaultContract(provider: ethers.ContractRunner) {
  return new ethers.Contract(CONTRACT_ADDRESS, VAULT_ABI, provider);
}

export type Capsule = {
  founder: string;
  unlockTimestamp: bigint;
  isWithdrawn: boolean;
  messageHash: string;
  depositedValue: bigint;
  createdAt: bigint;
  lockDuration: bigint;
};

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

/**
 * Validates that a transaction would succeed (static eth_call),
 * then estimates gas using eth_estimateGas via the raw RPC provider.
 *
 * eth_call is read-only — never triggers MetaMask pop-ups.
 */
export async function estimateGas(
  signer: ethers.JsonRpcSigner,
  contract: ethers.Contract,
  functionName: string,
  args: any[],
  txOptions?: { value?: bigint }
): Promise<GasEstimateResult> {
  try {
    const from = await signer.getAddress();
    const rpcProvider = signer.provider as ethers.BrowserProvider;
    const target = contract.target as string;
    const iface = contract.interface;

    const fragment = iface.getFunction(functionName)!;
    const callData = iface.encodeFunctionData(fragment, args);

    const tx = {
      from,
      to: target,
      data: callData,
      value: txOptions?.value ? "0x" + txOptions.value.toString(16) : "0x0",
    };

    // Step 1: eth_call — static validation. Never triggers wallet pop-up.
    try {
      await rpcProvider.call(tx);
    } catch (callErr: any) {
      const data = callErr.data || "";
      const reason = data.startsWith("0x")
        ? `Reverted: 0x${data.slice(2, 10)}...`
        : (callErr.reason || callErr.message || "Transaction would revert");
      return { success: false, error: reason };
    }

    // Step 2: eth_estimateGas via raw RPC — bypasses MetaMask signer intercept.
    let estimate: bigint;
    try {
      const estTx: any = { to: target, data: callData, value: tx.value };
      const raw = await (rpcProvider as any).send("eth_estimateGas", [estTx]);
      estimate = BigInt(raw);
    } catch {
      // Fallback to ethers estimation (may trigger popup — unavoidable)
      const fn = contract.getFunction(functionName);
      estimate = await fn.estimateGas(...args, txOptions || {});
    }

    const feeData = await rpcProvider.getFeeData();
    const gasPrice = feeData.gasPrice || BigInt(0);
    const costEth = Number(ethers.formatEther(estimate * gasPrice));
    return { estimate, costEth, success: true };

  } catch (err: any) {
    return { success: false, error: err.message || "Gas estimation failed" };
  }
}
