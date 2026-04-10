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
}

export interface CreateCapsuleParams {
  beneficiaryAddresses: string[];
  allocations: number[];
  lockDurationSeconds: number;
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
        const [capsule, beneficiaryCount, isUnlocked, timeRemaining] = await Promise.all([
          contract.getCapsule(capsuleId),
          contract.getBeneficiaryCount(capsuleId),
          contract.isUnlocked(capsuleId),
          contract.getTimeRemaining(capsuleId),
        ]);

        return {
          id: capsuleId,
          founder: capsule.founder,
          unlockTimestamp: capsule.unlockTimestamp,
          isWithdrawn: capsule.isWithdrawn,
          messageHash: capsule.messageHash,
          depositedValue: capsule.depositedValue,
          beneficiaryCount: Number(beneficiaryCount),
          isUnlocked,
          timeRemaining,
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
          params.lockDurationSeconds,
          params.messageHash,
          { value }
        );
        const receipt = await tx.wait();

        // Find CapsuleCreated event — indexed uint256 capsuleId is in topics[1]
        const capsuleEvent = receipt.logs.find(
          (l: any) => l.fragment?.name === "CapsuleCreated"
        );
        if (!capsuleEvent) {
          setError("CapsuleCreated event not found");
          return null;
        }

        // capsuleId is the first indexed param → topics[1] (topics[0] is event signature)
        // topics[1] is a 32-byte padded hex string
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

  return {
    loading,
    error,
    setError,
    getCapsule,
    getMyAllocation,
    createCapsule,
    claimCapsule,
    cancelCapsule,
    contractAddress: CONTRACT_ADDRESS,
  };
}
