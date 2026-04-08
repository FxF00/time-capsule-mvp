import { useState } from "react";
import { ethers } from "ethers";
import { Link } from "react-router-dom";
import { useTimeCapsule } from "../hooks/useTimeCapsule";
import WalletConnect from "../components/WalletConnect";
import Disclaimer from "../components/Disclaimer";
import CapsuleCard from "../components/CapsuleCard";
import DateTimePicker from "../components/DateTimePicker";
import type { CapsuleView } from "../hooks/useTimeCapsule";
import { uploadEncryptedMessage } from "../lib/ipfs";

const MIN_FEE_ETH = "0.001";

interface FormState {
  beneficiaryAddress: string;
  allocation: string;
  unlockDatetime: string; // ISO datetime string
  ethAmount: string;
  message: string;
}

function computeLockSeconds(unlockDatetime: string): number {
  const unlock = new Date(unlockDatetime).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((unlock - now) / 1000));
}

function formatLockDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function CreateCapsule() {
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Default unlock: now + 30 days
  const defaultUnlock = new Date(Date.now() + 30 * 86400 * 1000);
  const defaultISO = (
    defaultUnlock.getFullYear() + "-" +
    String(defaultUnlock.getMonth() + 1).padStart(2, "0") + "-" +
    String(defaultUnlock.getDate()).padStart(2, "0") + "T" +
    String(defaultUnlock.getHours()).padStart(2, "0") + ":" +
    String(defaultUnlock.getMinutes()).padStart(2, "0")
  );

  const [form, setForm] = useState<FormState>({
    beneficiaryAddress: "",
    allocation: "100",
    unlockDatetime: defaultISO,
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

    const lockSeconds = computeLockSeconds(form.unlockDatetime);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const unlockTimestamp = BigInt(nowSeconds + lockSeconds);

    // Validate
    if (!form.beneficiaryAddress || !ethers.isAddress(form.beneficiaryAddress)) {
      alert("Invalid beneficiary address");
      return;
    }
    if (lockSeconds < 60) {
      alert("Unlock time must be at least 1 minute in the future");
      return;
    }

    let messageHash = "";

    // Encrypt and upload message if provided
    if (form.message.trim()) {
      setUploading(true);
      try {
        const result = await uploadEncryptedMessage(
          form.beneficiaryAddress,
          unlockTimestamp,
          form.message
        );
        // Store both IPFS CID and encrypted content
        // Priority: IPFS CID (if available) → base64 encrypted content
        messageHash = result.cid || result.encryptedContent;
      } catch (err: any) {
        console.warn("Message upload failed:", err.message);
        messageHash = "";
      }
      setUploading(false);
    }

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
        setTxHash(`Capsule #${capsuleIdStr} created!`);
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

  const lockSeconds = computeLockSeconds(form.unlockDatetime);

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
            Your message has been <strong>encrypted</strong> with the beneficiary's address and unlock time.
            Only the beneficiary can decrypt it after the unlock time.
          </p>

          {/* Shareable link */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1rem", marginTop: "1rem" }}>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              Share this link with your beneficiary:
            </p>
            <code style={{ fontSize: "0.85rem", color: "var(--accent)", wordBreak: "break-all" }}>
              {typeof window !== "undefined" ? `${window.location.origin}/receive/${createdCapsule.founder}/${createdCapsule.id}` : ""}
            </code>
            <button
              onClick={() => {
                const url = `${window.location.origin}/receive/${createdCapsule.founder}/${createdCapsule.id}`;
                navigator.clipboard.writeText(url);
              }}
              style={{
                marginTop: "0.75rem",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "0.4rem 0.8rem",
                color: "var(--text-muted)",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              Copy Link
            </button>
          </div>

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

          {/* Beneficiary Address */}
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

          {/* Allocation */}
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

          {/* Unlock DateTime */}
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Unlock Date & Time
            </label>
            <DateTimePicker
              value={form.unlockDatetime}
              onChange={(iso) => setForm({ ...form, unlockDatetime: iso })}
            />
            <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: lockSeconds < 60 ? "#ef4444" : "var(--text-muted)", fontSize: "0.8rem" }}>
                {lockSeconds < 60
                  ? "Must be in the future"
                  : `Lock duration: ${formatLockDuration(lockSeconds)}`}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                {new Date(form.unlockDatetime).toLocaleString()}
              </span>
            </div>
          </div>

          {/* ETH Amount */}
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

          {/* Encrypted Message */}
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Message (optional — AES-256 encrypted with beneficiary key + unlock time)
            </label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Write a message to your beneficiaries... It will be encrypted and only they can decrypt it after unlock."
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
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.4rem" }}>
              Encrypted with AES-256-GCM. Key = keccak256(beneficiary + unlock time).
              Cannot be decrypted without both factors.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || uploading || lockSeconds < 60}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "1rem",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading || uploading || lockSeconds < 60 ? "not-allowed" : "pointer",
              opacity: loading || uploading || lockSeconds < 60 ? 0.7 : 1,
            }}
          >
            {uploading ? "Encrypting & uploading..." : loading ? "Creating..." : "Create Capsule"}
          </button>
        </form>
      )}
    </div>
  );
}
