import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { getVaultContract, CONTRACT_ADDRESS, Capsule } from "../lib/contracts";

export interface CapsuleView {
  id: number;
  founder: string;
  unlockTimestamp: bigint;
  isWithdrawn: boolean;
  messageHash: string;
  depositedValue: bigint;
  beneficiaryCount: number;
  isUnlocked: boolean;
  timeRemaining: bigint;
  createdAt: bigint;
  lockDuration: bigint;
  originalUnlockTime: bigint;
  primaryBeneficiary: string; // address of the first beneficiary — the only one who can decrypt
}

export interface CreateCapsuleParams {
  beneficiaryAddresses: string[];
  allocations: number[];
  lockDuration: number; // seconds — contract computes unlockTimestamp = createdAt + lockDuration
  messageHash: string;
  value: string; // ETH as string (e.g. "0.1")
}

export function useTimeCapsule() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCapsule = useCallback(
    async (capsuleId: number, signer: ethers.JsonRpcSigner): Promise<CapsuleView | null> => {
      try {
        const contract = getVaultContract(signer) as ethers.Contract;
        // Use manual getCapsule() — the auto-getter capsules() corrupts string fields
        // (returns keccak256 instead of actual string values).
        // getCapsule(uint256) returns the full Capsule struct in memory with correct values.
        const capsuleTuple = await contract.getCapsule(capsuleId) as any;
        const beneficiaryCount = await contract.getBeneficiaryCount(capsuleId);

        // Tuple decode order (matches contract struct field order):
        // [0]=founder, [1]=unlockTimestamp, [2]=isWithdrawn, [3]=messageHash,
        // [4]=beneficiaries[], [5]=depositedValue, [6]=createdAt,
        // [7]=lockDuration, [8]=originalUnlockTime, [9]=primaryBeneficiary
        const founder: string = capsuleTuple[0];
        const unlockTimestampFromContract: bigint = capsuleTuple[1];
        const isWithdrawn: boolean = capsuleTuple[2];
        const messageHash: string = capsuleTuple[3];
        const beneficiaries: string[] = capsuleTuple[4]; // not used directly
        const depositedValue: bigint = capsuleTuple[5];
        const createdAt: bigint = capsuleTuple[6];
        const lockDuration: bigint = capsuleTuple[7];
        const originalUnlockTime: bigint = capsuleTuple[8];
        const primaryBeneficiary: string = capsuleTuple[9];

        // Client-side unlock check: derive unlockTimestamp locally to avoid
        // block.timestamp drift between network calls (block.timestamp >= createdAt + lockDuration)
        const currentTime = BigInt(Math.floor(Date.now() / 1000));
        const unlockTimestamp = createdAt + lockDuration;
        const timeRemaining = unlockTimestamp > currentTime ? unlockTimestamp - currentTime : BigInt(0);
        const isUnlocked = currentTime >= unlockTimestamp;

        return {
          id: capsuleId,
          founder,
          unlockTimestamp: unlockTimestampFromContract,
          isWithdrawn,
          messageHash,
          depositedValue,
          createdAt,
          lockDuration,
          originalUnlockTime,
          beneficiaryCount: Number(beneficiaryCount),
          isUnlocked,
          timeRemaining,
          primaryBeneficiary,
        };
      } catch (err: any) {
        setError(err.message || "Failed to fetch capsule");
        return null;
      }
    },
    []
  );

  const getMyAllocation = useCallback(
    async (capsuleId: number, signer: ethers.JsonRpcSigner): Promise<{ allocation: bigint; claimed: boolean } | null> => {
      try {
        const contract = getVaultContract(signer) as ethers.Contract;
        const result = await contract.getMyAllocation(capsuleId);
        return { allocation: result[0], claimed: result[1] };
      } catch (err: any) {
        setError(err.message || "Failed to fetch allocation");
        return null;
      }
    },
    []
  );

  const createCapsule = useCallback(
    async (params: CreateCapsuleParams, signer: ethers.JsonRpcSigner): Promise<string | null> => {
      setLoading(true);
      setError(null);
      try {
        const contract = getVaultContract(signer) as ethers.Contract;
        const value = ethers.parseEther(params.value);
        const tx = await contract.createCapsule(
          params.beneficiaryAddresses,
          params.allocations,
          params.lockDuration,
          params.messageHash,
          { value }
        );
        const receipt = await tx.wait();

        // Try fragment-based lookup first (ethers v6 auto-decode path)
        let capsuleEvent = receipt.logs.find(
          (l: any) => l.fragment?.name === "CapsuleCreated"
        );

        // Fallback: manually decode using vault interface
        if (!capsuleEvent) {
          const vaultInterface = contract.interface;
          for (const log of receipt.logs) {
            try {
              const parsed = vaultInterface.parseLog({ topics: log.topics, data: log.data });
              if (parsed?.name === "CapsuleCreated") {
                capsuleEvent = { ...log, fragment: parsed.fragment, args: parsed.args };
                break;
              }
            } catch {
              // not this log — keep scanning
            }
          }
        }

        if (!capsuleEvent) {
          console.error("[createCapsule] CapsuleCreated event not found. All logs:");
          receipt.logs.forEach((l: any, i: number) => {
            console.error(`  log[${i}]: address=${l.address} topics=${JSON.stringify(l.topics)} data=${l.data}`);
          });
          setError("CapsuleCreated event not found");
          return null;
        }

        // capsuleId is the first indexed param → topics[1]
        // topics[0] = event signature hash, topics[1..3] = indexed params
        // topics[1] is a 32-byte padded uint256 hex string
        const capsuleIdHex = capsuleEvent.topics[1];
        if (!capsuleIdHex) {
          setError("CapsuleCreated event has no capsuleId in topics");
          return null;
        }
        const capsuleId = BigInt(capsuleIdHex);
        return capsuleId.toString();
      } catch (err: any) {
        setError(err.message || "Failed to create capsule");
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const claimCapsule = useCallback(
    async (capsuleId: number, signer: ethers.JsonRpcSigner): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const contract = getVaultContract(signer) as ethers.Contract;
        const tx = await contract.claim(capsuleId);
        await tx.wait();
        return true;
      } catch (err: any) {
        setError(err.message || "Failed to claim capsule");
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const cancelCapsule = useCallback(
    async (capsuleId: number, signer: ethers.JsonRpcSigner): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const contract = getVaultContract(signer) as ethers.Contract;
        const tx = await contract.cancelCapsule(capsuleId);
        await tx.wait();
        return true;
      } catch (err: any) {
        setError(err.message || "Failed to cancel capsule");
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const setMessageHash = useCallback(
    async (capsuleId: number, messageHash: string, signer: ethers.JsonRpcSigner): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const contract = getVaultContract(signer) as ethers.Contract;
        const tx = await contract.setMessageHash(capsuleId, messageHash);
        await tx.wait();
        return true;
      } catch (err: any) {
        setError(err.message || "Failed to set message hash");
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    setError,
    getCapsule,
    getMyAllocation,
    createCapsule,
    claimCapsule,
    cancelCapsule,
    setMessageHash,
    contractAddress: CONTRACT_ADDRESS,
  };
}
