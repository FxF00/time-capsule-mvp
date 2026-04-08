import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useTimeCapsule } from "../hooks/useTimeCapsule";
import WalletConnect from "../components/WalletConnect";
import CapsuleCard from "../components/CapsuleCard";
import type { CapsuleView } from "../hooks/useTimeCapsule";
import { getVaultContract } from "../lib/contracts";

export default function MyCapsules() {
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [capsules, setCapsules] = useState<CapsuleView[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const { getCapsule, cancelCapsule, error } = useTimeCapsule();

  useEffect(() => {
    if (signer && walletAddress) {
      loadCapsules(signer, walletAddress);
    }
  }, [signer, walletAddress]);

  async function loadCapsules(signer: ethers.JsonRpcSigner, address: string) {
    setLoading(true);
    try {
      const contract = getVaultContract(signer) as ethers.Contract;
      const totalCount = await contract.capsules.length;

      const myCapsules: CapsuleView[] = [];
      for (let i = 0; i < totalCount; i++) {
        const capsule = await getCapsule(i, signer);
        if (capsule && capsule.founder.toLowerCase() === address.toLowerCase()) {
          myCapsules.push(capsule);
        }
      }
      setCapsules(myCapsules);
    } catch (err: any) {
      console.error("Failed to load capsules:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnected(signer: ethers.JsonRpcSigner, address: string) {
    setSigner(signer);
    setWalletAddress(address);
  }

  async function handleCancel(capsuleId: number) {
    if (!signer) return;
    if (!window.confirm("Are you sure you want to cancel this capsule? The funds will be returned to you.")) {
      return;
    }
    setCancellingId(capsuleId);
    const success = await cancelCapsule(capsuleId, signer);
    if (success && walletAddress && signer) {
      await loadCapsules(signer, walletAddress);
    }
    setCancellingId(null);
  }

  if (!walletAddress) {
    return (
      <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <h2 style={{ marginBottom: "2rem" }}>My Capsules</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
          Connect your wallet to view capsules you have created.
        </p>
        <WalletConnect onConnected={handleConnected} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2>My Capsules</h2>
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
          {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
        </span>
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", padding: "0.75rem", borderRadius: "8px", fontSize: "0.9rem", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          Loading capsules...
        </div>
      ) : capsules.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem 2rem", color: "var(--text-muted)" }}>
          <p style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>No capsules found</p>
          <p style={{ fontSize: "0.9rem" }}>You haven&apos;t created any capsules yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {capsules.map((capsule) => (
            <div key={capsule.id} style={{ position: "relative" }}>
              <CapsuleCard capsule={capsule} />
              {canCancel(capsule) && (
                <button
                  onClick={() => handleCancel(capsule.id)}
                  disabled={cancellingId === capsule.id}
                  style={{
                    marginTop: "0.75rem",
                    background: "transparent",
                    border: "1px solid var(--danger)",
                    color: "var(--danger)",
                    borderRadius: "8px",
                    padding: "0.5rem 1rem",
                    fontSize: "0.85rem",
                    cursor: cancellingId === capsule.id ? "not-allowed" : "pointer",
                    opacity: cancellingId === capsule.id ? 0.7 : 1,
                  }}
                >
                  {cancellingId === capsule.id ? "Cancelling..." : "Cancel Capsule"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function canCancel(capsule: CapsuleView): boolean {
  return !capsule.isUnlocked && !capsule.isWithdrawn;
}
