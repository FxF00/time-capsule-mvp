import { useState } from "react";
import { ethers } from "ethers";
import { Link } from "react-router-dom";
import { useTimeCapsule } from "../hooks/useTimeCapsule";
import WalletConnect from "../components/WalletConnect";
import Disclaimer from "../components/Disclaimer";
import CapsuleCard from "../components/CapsuleCard";
import type { CapsuleView } from "../hooks/useTimeCapsule";
import { uploadToIPFS } from "../lib/ipfs";

const MIN_LOCK_DAYS = 1;
const MAX_LOCK_DAYS = 3650; // 10 years
const MIN_FEE_ETH = "0.001";

interface FormState {
  beneficiaryAddress: string;
  allocation: string;
  lockDays: string;
  ethAmount: string;
  message: string;
}

export default function CreateCapsule() {
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    beneficiaryAddress: "",
    allocation: "100",
    lockDays: "30",
    ethAmount: "0.01",
    message: "",
  });
  const [createdCapsule, setCreatedCapsule] = useState<CapsuleView | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { loading, error, createCapsule, getCapsule } = useTimeCapsule();

  async function handleConnected(signer: ethers.JsonRpcSigner, address: string) {
    setSigner(signer);
    setWalletAddress(address);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signer) return;

    let messageHash = "";

    // Upload message to IPFS if provided
    if (form.message.trim()) {
      setUploading(true);
      try {
        const result = await uploadToIPFS(form.message);
        messageHash = result.cid;
      } catch (err: any) {
        alert(`IPFS upload failed: ${err.message}`);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const lockSeconds = Number(form.lockDays) * 86400;
    const capsuleIdStr = await createCapsule(
      {
        beneficiaryAddresses: [form.beneficiaryAddress],
        allocations: [Number(form.allocation)],
        lockDurationSeconds: lockSeconds,
        messageHash,
        value: form.ethAmount,
      },
      signer
    );

    if (capsuleIdStr !== null) {
      const capsule = await getCapsule(Number(capsuleIdStr), signer);
      if (capsule) {
        setCreatedCapsule(capsule);
        setTxHash(`Capsule #${capsuleIdStr} created successfully!`);
      }
    }
  }

  if (!walletAddress) {
    return (
      <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <h2 style={{ marginBottom: "2rem" }}>Create Time Capsule</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
          Connect your wallet to create a new time capsule vault.
        </p>
        <WalletConnect onConnected={handleConnected} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2>Create Time Capsule</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
            {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
          </span>
          <Link to="/claim" style={{ color: "var(--accent-light)", fontSize: "0.9rem" }}>
            Claim →
          </Link>
        </div>
      </div>

      <Disclaimer />

      {createdCapsule ? (
        <div>
          <CapsuleCard capsule={createdCapsule} />
          <p style={{ color: "var(--success)", marginTop: "1rem", fontWeight: 600 }}>
            {txHash}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
            Share the capsule ID with your beneficiary. They will need this to claim.
          </p>
          <button
            onClick={() => setCreatedCapsule(null)}
            style={{
              marginTop: "1rem",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "0.5rem 1rem",
              cursor: "pointer",
            }}
          >
            Create Another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", padding: "0.75rem", borderRadius: "8px", fontSize: "0.9rem" }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Beneficiary Address
            </label>
            <input
              type="text"
              value={form.beneficiaryAddress}
              onChange={(e) => setForm({ ...form, beneficiaryAddress: e.target.value })}
              placeholder="0x..."
              required
              style={{
                width: "100%",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "0.75rem",
                color: "var(--text)",
                fontSize: "0.95rem",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Allocation (%)
            </label>
            <input
              type="number"
              value={form.allocation}
              onChange={(e) => setForm({ ...form, allocation: e.target.value })}
              min="1"
              max="100"
              required
              style={{
                width: "100%",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "0.75rem",
                color: "var(--text)",
                fontSize: "0.95rem",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Lock Duration (days) — {MIN_LOCK_DAYS} to {MAX_LOCK_DAYS}
            </label>
            <input
              type="number"
              value={form.lockDays}
              onChange={(e) => setForm({ ...form, lockDays: e.target.value })}
              min={MIN_LOCK_DAYS}
              max={MAX_LOCK_DAYS}
              required
              style={{
                width: "100%",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "0.75rem",
                color: "var(--text)",
                fontSize: "0.95rem",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
              ETH Amount (min {MIN_FEE_ETH})
            </label>
            <input
              type="number"
              value={form.ethAmount}
              onChange={(e) => setForm({ ...form, ethAmount: e.target.value })}
              min={MIN_FEE_ETH}
              step="0.001"
              required
              style={{
                width: "100%",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "0.75rem",
                color: "var(--text)",
                fontSize: "0.95rem",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Message (optional — stored on IPFS)
            </label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Write a message to your beneficiaries..."
              rows={4}
              style={{
                width: "100%",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "0.75rem",
                color: "var(--text)",
                fontSize: "0.95rem",
                resize: "vertical",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || uploading}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "1rem",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading || uploading ? "not-allowed" : "pointer",
              opacity: loading || uploading ? 0.7 : 1,
            }}
          >
            {uploading ? "Uploading to IPFS..." : loading ? "Creating..." : "Create Capsule"}
          </button>
        </form>
      )}
    </div>
  );
}
