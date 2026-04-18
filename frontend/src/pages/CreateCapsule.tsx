import { useState, useRef, useEffect } from "react";
import { ethers } from "ethers";
import { Link } from "react-router-dom";
import { toCanvas as qrcode } from "qrcode";
import { useTimeCapsule } from "../hooks/useTimeCapsule";
import WalletConnect from "../components/WalletConnect";
import Disclaimer from "../components/Disclaimer";
import CapsuleCard from "../components/CapsuleCard";
import DurationSelector from "../components/DurationSelector";
import { useToast } from "../components/Toast";
import { parseContractError } from "../lib/errors";
import type { CapsuleView } from "../hooks/useTimeCapsule";
import { uploadEncryptedMessage } from "../lib/ipfs";
import { getVaultContract, estimateGas, type GasEstimateResult } from "../lib/contracts";
import { useNetwork, getNetworkInfo } from "../contexts/NetworkContext";

const MIN_FEE_ETH = "0.001";
const MAX_BENEFICIARIES = 10;
const MAX_LOCK_SECONDS = 10 * 365 * 24 * 60 * 60; // 10 years — matches contract

interface BeneficiaryRow {
  address: string;
  allocation: string;
}

interface FormState {
  beneficiaries: BeneficiaryRow[];
  duration: number | null;
  ethAmount: string;
  message: string;
}

function computeTotalAllocation(beneficiaries: BeneficiaryRow[]): number {
  return beneficiaries.reduce((sum, b) => sum + (Number(b.allocation) || 0), 0);
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
  const { setNetwork, setProvider } = useNetwork();
  const [gasEstimate, setGasEstimate] = useState<GasEstimateResult | null>(null);
  const { showToast } = useToast();

  const [form, setForm] = useState<FormState>({
    beneficiaries: [{ address: "", allocation: "100" }],
    duration: null,
    ethAmount: "0.01",
    message: "",
  });

  const [createdCapsule, setCreatedCapsule] = useState<CapsuleView | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const { loading, error, createCapsule, getCapsule, setMessageHash } = useTimeCapsule();

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
      color: { dark: "#e8dcc8", light: "#0c0c16" },
    });
  }, [createdCapsule]);

  async function handleConnected(signer: ethers.JsonRpcSigner, address: string) {
    setSigner(signer);
    setWalletAddress(address);
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
    const value = ethers.parseEther(form.ethAmount || "0");
    const lockDuration = form.duration;
    const isValidAddresses = addresses.every((addr) => ethers.isAddress(addr));
    if (!isValidAddresses || lockDuration === null || lockDuration < 60 || totalAllocation !== 100) {
      setGasEstimate(null);
      return;
    }
    try {
      const contract = getVaultContract(signer) as ethers.Contract;
      const result = await estimateGas(
        signer,
        contract.createCapsule,
        [addresses, allocations, lockDuration, ""],
        null
      );
      setGasEstimate(result);
    } catch (err: any) {
      setGasEstimate({ success: false, error: err.message || "Gas estimation failed" });
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => updateGasEstimate(), 500);
    return () => clearTimeout(timeout);
  }, [form, signer, walletAddress, totalAllocation]);

  function addBeneficiary() {
    if (!canAddBeneficiary) return;
    setForm({ ...form, beneficiaries: [...form.beneficiaries, { address: "", allocation: "" }] });
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
    const lockDuration = form.duration;
    const addresses = form.beneficiaries.map((b) => b.address.trim());
    const allocations = form.beneficiaries.map((b) => Number(b.allocation));

    for (const addr of addresses) {
      if (!addr || !ethers.isAddress(addr)) {
        showToast("error", "Invalid beneficiary address");
        return;
      }
    }
    if (lockDuration === null) {
      showToast("error", "Please select a lock duration");
      return;
    }
    if (lockDuration < 60) {
      showToast("error", "Lock duration must be at least 60 seconds");
      return;
    }
    if (!isAllocationValid) {
      showToast("error", `Total allocation must equal 100% (currently ${totalAllocation}%)`);
      return;
    }

    const capsuleIdStr = await createCapsule(
      { beneficiaryAddresses: addresses, allocations, lockDuration, messageHash: "", value: form.ethAmount },
      signer
    );
    if (capsuleIdStr === null) return;

    const capsule = await getCapsule(Number(capsuleIdStr), signer);
    if (!capsule) {
      showToast("error", "Capsule created but failed to retrieve it");
      return;
    }
    const primaryBeneficiary = addresses[0];

    let finalMessageHash = "";
    if (form.message.trim()) {
      setUploading(true);
      try {
        const authoritativeUnlockTimestamp = capsule.createdAt + capsule.lockDuration;
        const result = await uploadEncryptedMessage(primaryBeneficiary, authoritativeUnlockTimestamp, form.message);
        finalMessageHash = result.cid || result.encryptedContent;
        const hashSet = await setMessageHash(Number(capsuleIdStr), finalMessageHash, signer);
        if (!hashSet) {
          showToast("error", "Message encrypted but failed to store on-chain");
          finalMessageHash = "";
        }
      } catch (err: any) {
        console.warn("Message upload failed:", err.message);
        finalMessageHash = "";
        showToast("error", "Message encryption failed — the capsule will be created without a message.");
      }
      setUploading(false);
    }

    const updatedCapsule = await getCapsule(Number(capsuleIdStr), signer);
    if (updatedCapsule) {
      setCreatedCapsule(updatedCapsule);
      setTxHash(`Capsule #${capsuleIdStr} created!`);
      showToast("success", "Transaction submitted!");
      try {
        const capsuleData = {
          id: updatedCapsule.id,
          founder: updatedCapsule.founder,
          beneficiaries: form.beneficiaries.map((b, i) => ({ address: addresses[i], allocation: allocations[i] })),
        };
        sessionStorage.setItem(`capsule_beneficiaries_${walletAddress}_${updatedCapsule.id}`, JSON.stringify(capsuleData));
        sessionStorage.setItem(`capsule_${updatedCapsule.founder}_${updatedCapsule.id}_primary_beneficiary`, addresses[0]);
      } catch (err) { /* sessionStorage may be unavailable */ }
    }
  }

  if (!walletAddress) {
    return (
      <div className="page-container" style={{ textAlign: "center", paddingTop: "4rem", paddingBottom: "4rem" }}>
        <h2 style={{ marginBottom: "2rem" }}>Create Time Capsule</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
          Connect your wallet to create a new time capsule vault.
        </p>
        <WalletConnect onConnected={handleConnected} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Create Time Capsule</h2>
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted font-mono">
            {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
          </span>
          <Link to="/claim" className="link-arrow">
            Claim <span>→</span>
          </Link>
        </div>
      </div>

      <Disclaimer />

      {createdCapsule ? (
        <div className="animate-in">
          <CapsuleCard capsule={createdCapsule} />

          <div className="card mt-1" style={{ padding: "0.75rem" }}>
            <span className="text-muted text-sm">Lock Duration: </span>
            <span className="text-accent font-mono font-bold">
              {createdCapsule.lockDuration ? formatLockDuration(Number(createdCapsule.lockDuration)) : "N/A"}
            </span>
          </div>

          <p className="text-success mt-2 font-bold">
            {txHash}
          </p>
          {createdCapsule?.messageHash ? (
            <p className="text-success text-sm mt-1">
              Your message has been <strong>encrypted</strong> with the first beneficiary address + unlock time.
            </p>
          ) : (
            <p className="text-muted text-sm mt-1">
              No message was attached to this capsule.
            </p>
          )}

          {/* Beneficiary summary */}
          <div className="share-box">
            <p className="text-muted text-xs mb-1">Beneficiaries &amp; Allocations:</p>
            {form.beneficiaries.map((b, i) => (
              <div key={i} className="flex justify-between text-sm mb-quarter" style={{ marginBottom: "0.25rem" }}>
                <span className="font-mono text-accent">
                  {b.address ? `${b.address.slice(0, 6)}...${b.address.slice(-4)}` : "—"}
                </span>
                <span className="text">{b.allocation}%</span>
              </div>
            ))}
          </div>

          {/* Shareable link */}
          <div className="share-box">
            <p className="text-muted text-xs mb-1">Share this link with your beneficiaries:</p>
            <code className="font-mono text-accent text-sm" style={{ wordBreak: "break-all" }}>
              {typeof window !== "undefined" ? `${window.location.origin}/receive/${createdCapsule.founder}/${createdCapsule.id}` : ""}
            </code>
            <div className="flex justify-center mt-1">
              <canvas ref={qrCanvasRef} className="qr-canvas" />
            </div>
            <button
              className="btn btn-ghost btn-sm mt-1"
              style={{ width: "100%" }}
              onClick={() => {
                const url = `${window.location.origin}/receive/${createdCapsule.founder}/${createdCapsule.id}`;
                navigator.clipboard.writeText(url);
                showToast("success", "Link copied to clipboard!");
              }}
            >
              Copy Link
            </button>
          </div>

          <button
            className="btn btn-primary mt-2"
            onClick={() => {
              setCreatedCapsule(null);
              setForm({
                beneficiaries: [{ address: "", allocation: "100" }],
                duration: null,
                ethAmount: "0.01",
                message: "",
              });
            }}
          >
            Create Another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {error && (
            <div className="alert alert-danger">
              {parseContractError(error)}
            </div>
          )}

          {/* Beneficiaries */}
          <div className="card">
            <div className="flex justify-between items-center mb-1">
              <label className="label" style={{ margin: 0 }}>Beneficiaries &amp; Allocations</label>
              <span
                className={`text-xs font-bold ${isAllocationValid ? "text-success" : "text-danger"}`}
              >
                Total: {totalAllocation}% {isAllocationValid ? "✓" : "(must be 100%)"}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              {form.beneficiaries.map((beneficiary, index) => (
                <div key={index} className="flex gap-1 items-center">
                  <input
                    type="text"
                    className="input"
                    value={beneficiary.address}
                    onChange={(e) => updateBeneficiary(index, "address", e.target.value)}
                    placeholder="0x..."
                    required
                  />
                  <div style={{ position: "relative", width: "90px", flexShrink: 0 }}>
                    <input
                      type="number"
                      className="input"
                      value={beneficiary.allocation}
                      onChange={(e) => updateBeneficiary(index, "allocation", e.target.value)}
                      placeholder="%"
                      min="1"
                      max="100"
                      required
                      style={{ paddingRight: "1.5rem" }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--text-muted)",
                        fontSize: "0.8rem",
                        pointerEvents: "none",
                      }}
                    >
                      %
                    </span>
                  </div>
                  {form.beneficiaries.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      style={{ flexShrink: 0, padding: "0.4rem 0.6rem", minHeight: "unset" }}
                      onClick={() => removeBeneficiary(index)}
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
                className="btn btn-ghost btn-sm mt-1"
                style={{ width: "100%", borderStyle: "dashed" }}
                onClick={addBeneficiary}
              >
                + Add Beneficiary (max {MAX_BENEFICIARIES})
              </button>
            )}
          </div>

          {/* Lock Duration */}
          <div className="card">
            <label className="label">Lock Duration</label>
            <DurationSelector
              value={form.duration}
              onChange={(seconds) => setForm({ ...form, duration: seconds })}
              minDuration={60}
              maxDuration={MAX_LOCK_SECONDS}
            />
            {form.duration !== null && (
              <p className="duration-hint">Lock duration: {formatLockDuration(form.duration)}</p>
            )}
          </div>

          {/* ETH Amount */}
          <div className="form-group">
            <label className="label">ETH Amount (min {MIN_FEE_ETH})</label>
            <input
              type="number"
              className="input"
              value={form.ethAmount}
              onChange={(e) => setForm({ ...form, ethAmount: e.target.value })}
              min={MIN_FEE_ETH}
              step="0.001"
              required
            />
          </div>

          {/* Message */}
          <div className="form-group">
            <label className="label">Message (optional — AES-256 encrypted)</label>
            <textarea
              className="input"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Write a message to your beneficiaries... It will be encrypted and only they can decrypt after unlock."
              rows={4}
            />
            <p className="text-muted text-xs mt-1">
              Encrypted with AES-256-GCM. Key = keccak256(first beneficiary + unlock time).
            </p>
          </div>

          {/* Gas Estimate */}
          {gasEstimate && (
            <div className={`alert ${gasEstimate.success ? "alert-success" : "alert-danger"}`}>
              {gasEstimate.success ? (
                <span className="text-success">
                  Estimated gas: ~{gasEstimate.costEth.toFixed(6)} ETH
                </span>
              ) : (
                <span className="text-danger">
                  Gas estimation unavailable: {gasEstimate.error}
                </span>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading || uploading || form.duration === null || form.duration < 60 || !isAllocationValid}
          >
            {uploading ? "Encrypting & uploading..." : loading ? "Creating..." : "Create Capsule"}
          </button>
        </form>
      )}
    </div>
  );
}
