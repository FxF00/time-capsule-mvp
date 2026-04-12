import { useState, useRef, useEffect } from "react";
import { ethers } from "ethers";
import { Link } from "react-router-dom";
import { toCanvas as qrcode } from "qrcode";
import { useTimeCapsule } from "../hooks/useTimeCapsule";
import WalletConnect from "../components/WalletConnect";
import Disclaimer from "../components/Disclaimer";
import CapsuleCard from "../components/CapsuleCard";
import DateTimePicker from "../components/DateTimePicker";
import { useToast } from "../components/Toast";
import { parseContractError } from "../lib/errors";
import type { CapsuleView } from "../hooks/useTimeCapsule";
import { uploadEncryptedMessage } from "../lib/ipfs";
import { getVaultContract, estimateGas, type GasEstimateResult } from "../lib/contracts";
import { useNetwork, getNetworkInfo } from "../contexts/NetworkContext";

const MIN_FEE_ETH = "0.001";
const MAX_BENEFICIARIES = 10;

interface BeneficiaryRow {
  address: string;
  allocation: string;
}

interface FormState {
  beneficiaries: BeneficiaryRow[];
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

function computeTotalAllocation(beneficiaries: BeneficiaryRow[]): number {
  return beneficiaries.reduce((sum, b) => sum + (Number(b.allocation) || 0), 0);
}

export default function CreateCapsule() {
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const { setNetwork, setProvider } = useNetwork();
  const [gasEstimate, setGasEstimate] = useState<GasEstimateResult | null>(null);
  const { showToast } = useToast();

  // Default unlock: now + 60 seconds (timezone-aware ISO string)
  const defaultUnlock = new Date(Date.now() + 60000);
  function pad(n: number, len = 2): string {
    return String(n).padStart(len, "0");
  }
  function localISO(d: Date): string {
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const absOffset = Math.abs(offset);
    return (
      d.getFullYear() + "-" +
      pad(d.getMonth() + 1) + "-" +
      pad(d.getDate()) + "T" +
      pad(d.getHours()) + ":" +
      pad(d.getMinutes()) +
      `${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`
    );
  }
  const defaultISO = localISO(defaultUnlock);

  const [form, setForm] = useState<FormState>({
    beneficiaries: [{ address: "", allocation: "100" }],
    unlockDatetime: defaultISO,
    ethAmount: "0.01",
    message: "",
  });

  const [createdCapsule, setCreatedCapsule] = useState<CapsuleView | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const { loading, error, createCapsule, getCapsule } = useTimeCapsule();

  const totalAllocation = computeTotalAllocation(form.beneficiaries);
  const isAllocationValid = totalAllocation === 100;
  const canAddBeneficiary = form.beneficiaries.length < MAX_BENEFICIARIES;

  // Generate QR code when capsule is created
  useEffect(() => {
    if (!createdCapsule || !qrCanvasRef.current) return;
    const url = `${window.location.origin}/receive/${createdCapsule.founder}/${createdCapsule.id}`;
    qrcode(qrCanvasRef.current, url, {
      width: 200,
      margin: 2,
      color: {
        dark: "#e2e8f0",
        light: "#1e293b",
      },
    });
  }, [createdCapsule]);

  async function handleConnected(signer: ethers.JsonRpcSigner, address: string) {
    setSigner(signer);
    setWalletAddress(address);
    // Detect and set network
    const provider = signer.provider as ethers.BrowserProvider;
    if (provider) {
      setProvider(provider);
      try {
        const network = await provider.getNetwork();
        setNetwork(getNetworkInfo(network));
      } catch (err) {
        console.warn("Failed to detect network:", err);
      }
    }
  }

  async function updateGasEstimate() {
    if (!signer || !walletAddress) {
      setGasEstimate(null);
      return;
    }

    const addresses = form.beneficiaries.map((b) => b.address.trim());
    const allocations = form.beneficiaries.map((b) => Number(b.allocation));
    // Use block.timestamp instead of Date.now() to avoid clock drift between browser and Hardhat
    const block = await signer.provider.getBlock('latest');
    if (!block) return;
    const blockTimestampSec = Number(block.timestamp);
    const unlockSec = Math.floor(new Date(form.unlockDatetime).getTime() / 1000);
    const lockSeconds = Math.max(0, unlockSec - blockTimestampSec);
    const unlockTimestamp = BigInt(blockTimestampSec + lockSeconds);
    const value = ethers.parseEther(form.ethAmount || "0");

    // Validate basic conditions for gas estimation
    const isValidAddresses = addresses.every((addr) => ethers.isAddress(addr));
    const MIN_LOCK_SECONDS = 60; // 60 seconds — must match contract
    if (!isValidAddresses || lockSeconds < MIN_LOCK_SECONDS || totalAllocation !== 100) {
      setGasEstimate(null);
      return;
    }

    try {
      const contract = getVaultContract(signer) as ethers.Contract;
      const result = await estimateGas(
        signer,
        contract.createCapsule,
        addresses,
        allocations,
        lockSeconds,
        "",
        { value }
      );
      setGasEstimate(result);
    } catch (err: any) {
      setGasEstimate({ success: false, error: err.message || "Gas estimation failed" });
    }
  }

  // Estimate gas when form changes
  useEffect(() => {
    const timeout = setTimeout(() => {
      updateGasEstimate();
    }, 500);
    return () => clearTimeout(timeout);
  }, [form, signer, walletAddress, totalAllocation]);

  function addBeneficiary() {
    if (!canAddBeneficiary) return;
    setForm({
      ...form,
      beneficiaries: [...form.beneficiaries, { address: "", allocation: "" }],
    });
  }

  function removeBeneficiary(index: number) {
    if (form.beneficiaries.length <= 1) return;
    const newBeneficiaries = form.beneficiaries.filter((_, i) => i !== index);
    setForm({ ...form, beneficiaries: newBeneficiaries });
  }

  function updateBeneficiary(index: number, field: "address" | "allocation", value: string) {
    const newBeneficiaries = [...form.beneficiaries];
    newBeneficiaries[index] = { ...newBeneficiaries[index], [field]: value };
    setForm({ ...form, beneficiaries: newBeneficiaries });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signer) return;

    // Use block.timestamp instead of Date.now() to avoid clock drift between browser and Hardhat
    const block = await signer.provider.getBlock('latest');
    if (!block) return;
    const blockTimestampSec = Number(block.timestamp);
    const unlockSec = Math.floor(new Date(form.unlockDatetime).getTime() / 1000);
    const lockSeconds = Math.max(0, unlockSec - blockTimestampSec);
    const unlockTimestamp = BigInt(blockTimestampSec + lockSeconds);

    // Validate addresses
    const addresses = form.beneficiaries.map((b) => b.address.trim());
    const allocations = form.beneficiaries.map((b) => Number(b.allocation));

    for (const addr of addresses) {
      if (!addr || !ethers.isAddress(addr)) {
        showToast("error", "Invalid beneficiary address");
        return;
      }
    }

    if (lockSeconds < 60) {
      showToast("error", "Unlock time must be at least 60 seconds (contract minimum)");
      return;
    }

    if (!isAllocationValid) {
      showToast("error", `Total allocation must equal 100% (currently ${totalAllocation}%)`);
      return;
    }

    // For message encryption, use the first beneficiary's address
    const primaryBeneficiary = addresses[0];

    let messageHash = "";

    // Encrypt and upload message if provided
    if (form.message.trim()) {
      setUploading(true);
      try {
        const result = await uploadEncryptedMessage(
          primaryBeneficiary,
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
        beneficiaryAddresses: addresses,
        allocations,
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
        showToast('success', 'Transaction submitted!');
        // Store beneficiary info for founder to view later
        try {
          const capsuleData = {
            id: capsule.id,
            founder: capsule.founder,
            beneficiaries: form.beneficiaries.map((b, i) => ({
              address: addresses[i],
              allocation: allocations[i],
            })),
          };
          sessionStorage.setItem(`capsule_beneficiaries_${walletAddress}_${capsule.id}`, JSON.stringify(capsuleData));
        } catch (err) {
          // sessionStorage may be unavailable
        }
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
            Your message has been <strong>encrypted</strong> with the first beneficiary's address and unlock time.
            Only beneficiaries can decrypt it after the unlock time.
          </p>

          {/* Beneficiary summary for founder */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1rem", marginTop: "1rem" }}>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              Beneficiaries & Allocations:
            </p>
            {form.beneficiaries.map((b, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                <span style={{ fontFamily: "monospace", color: "var(--accent)" }}>
                  {b.address.slice(0, 6)}...{b.address.slice(-4)}
                </span>
                <span style={{ color: "var(--text)" }}>
                  {b.allocation}%
                </span>
              </div>
            ))}
          </div>

          {/* Shareable link */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1rem", marginTop: "1rem" }}>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              Share this link with your beneficiaries:
            </p>
            <code style={{ fontSize: "0.85rem", color: "var(--accent)", wordBreak: "break-all" }}>
              {typeof window !== "undefined" ? `${window.location.origin}/receive/${createdCapsule.founder}/${createdCapsule.id}` : ""}
            </code>
            <div style={{ display: "flex", justifyContent: "center", marginTop: "1rem" }}>
              <canvas ref={qrCanvasRef} style={{ borderRadius: "8px" }} />
            </div>
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
              {parseContractError(error)}
            </div>
          )}

          {/* Beneficiaries Section */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <label style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                Beneficiaries & Allocations
              </label>
              <span style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: isAllocationValid ? "var(--success)" : "#ef4444",
              }}>
                Total: {totalAllocation}% {isAllocationValid ? "✓" : "(must be 100%)"}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {form.beneficiaries.map((beneficiary, index) => (
                <div key={index} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="text"
                    value={beneficiary.address}
                    onChange={(e) => updateBeneficiary(index, "address", e.target.value)}
                    placeholder="0x..."
                    required
                    style={{
                      flex: 1,
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "0.75rem",
                      color: "var(--text)",
                      fontSize: "0.9rem",
                    }}
                  />
                  <div style={{ position: "relative", width: "90px" }}>
                    <input
                      type="number"
                      value={beneficiary.allocation}
                      onChange={(e) => updateBeneficiary(index, "allocation", e.target.value)}
                      placeholder="%"
                      min="1"
                      max="100"
                      required
                      style={{
                        width: "100%",
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        padding: "0.75rem",
                        paddingRight: "1.5rem",
                        color: "var(--text)",
                        fontSize: "0.9rem",
                      }}
                    />
                    <span style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-muted)",
                      fontSize: "0.8rem",
                      pointerEvents: "none",
                    }}>
                      %
                    </span>
                  </div>
                  {form.beneficiaries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeBeneficiary(index)}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(239,68,68,0.3)",
                        borderRadius: "6px",
                        padding: "0.5rem 0.6rem",
                        color: "#ef4444",
                        fontSize: "0.85rem",
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canAddBeneficiary && (
              <button
                type="button"
                onClick={addBeneficiary}
                style={{
                  marginTop: "0.75rem",
                  background: "transparent",
                  border: "1px dashed var(--border)",
                  borderRadius: "8px",
                  padding: "0.6rem",
                  color: "var(--text-muted)",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                + Add Beneficiary (max {MAX_BENEFICIARIES})
              </button>
            )}
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
              Encrypted with AES-256-GCM. Key = keccak256(first beneficiary + unlock time).
              Cannot be decrypted without both factors.
            </p>
          </div>

          {/* Gas Estimate */}
          {gasEstimate && (
            <div style={{
              background: gasEstimate.success ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${gasEstimate.success ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
              borderRadius: "8px",
              padding: "0.75rem",
              fontSize: "0.85rem",
            }}>
              {gasEstimate.success ? (
                <span style={{ color: "var(--success)" }}>
                  Estimated gas: ~{gasEstimate.costEth.toFixed(6)} ETH
                </span>
              ) : (
                <span style={{ color: "#ef4444" }}>
                  Gas estimation unavailable: {gasEstimate.error}
                </span>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || uploading || lockSeconds < 60 || !isAllocationValid}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "1rem",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading || uploading || lockSeconds < 60 || !isAllocationValid ? "not-allowed" : "pointer",
              opacity: loading || uploading || lockSeconds < 60 || !isAllocationValid ? 0.7 : 1,
            }}
          >
            {uploading ? "Encrypting & uploading..." : loading ? "Creating..." : "Create Capsule"}
          </button>
        </form>
      )}
    </div>
  );
}
