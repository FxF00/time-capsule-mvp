import { useState } from "react";
import { ethers } from "ethers";
import { Link } from "react-router-dom";
import { useTimeCapsule } from "../hooks/useTimeCapsule";
import WalletConnect from "../components/WalletConnect";
import Disclaimer from "../components/Disclaimer";
import CapsuleCard from "../components/CapsuleCard";
import type { CapsuleView } from "../hooks/useTimeCapsule";
import { decryptStoredMessage } from "../lib/ipfs";
import { getVaultContract, estimateGas, type GasEstimateResult } from "../lib/contracts";
import { useNetwork, getNetworkInfo } from "../contexts/NetworkContext";
import { useToast } from "../components/Toast";
import { parseContractError } from "../lib/errors";

export default function ClaimCapsule() {
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [capsuleId, setCapsuleId] = useState("");
  const [capsule, setCapsule] = useState<CapsuleView | null>(null);
  const [myAllocation, setMyAllocation] = useState<{ allocation: bigint; claimed: boolean } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [decryptedMessage, setDecryptedMessage] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [claimGasEstimate, setClaimGasEstimate] = useState<GasEstimateResult | null>(null);

  const { setNetwork, setProvider } = useNetwork();
  const { showToast } = useToast();
  const { loading, error, setError, getCapsule, getMyAllocation, claimCapsule } = useTimeCapsule();

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

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!signer) return;
    setError(null);
    setNotFound(false);

    const id = Number(capsuleId);
    const [capsuleData, allocationData] = await Promise.all([
      getCapsule(id, signer),
      getMyAllocation(id, signer),
    ]);

    if (!capsuleData) {
      setNotFound(true);
      return;
    }

    setCapsule(capsuleData);
    setMyAllocation(allocationData);

    // Estimate gas for claim if eligible
    if (allocationData && !allocationData.claimed && capsuleData.isUnlocked && signer) {
      try {
        const contract = getVaultContract(signer) as ethers.Contract;
        const result = await estimateGas(signer, contract.claim, id);
        setClaimGasEstimate(result);
      } catch (err: any) {
        setClaimGasEstimate({ success: false, error: err.message || "Gas estimation failed" });
      }
    } else {
      setClaimGasEstimate(null);
    }
  }

  async function handleClaim() {
    if (!signer || !capsule) return;
    const success = await claimCapsule(capsule.id, signer);
    if (success) {
      showToast('success', 'Transaction submitted!');
      const updated = await getCapsule(capsule.id, signer);
      if (updated) setCapsule(updated);
    } else if (error) {
      showToast('error', parseContractError(error));
    }
  }

  async function handleDecryptMessage() {
    if (!capsule || !walletAddress) return;
    setDecrypting(true);
    setDecryptError(null);
    try {
      const message = await decryptStoredMessage(
        walletAddress,
        capsule.unlockTimestamp,
        capsule.messageHash
      );
      setDecryptedMessage(message);
    } catch (err: any) {
      setDecryptError(err.message || "Decryption failed");
    } finally {
      setDecrypting(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2>Claim Capsule</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
            {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Not connected"}
          </span>
          <Link to="/create" style={{ color: "var(--accent-light)", fontSize: "0.9rem" }}>
            ← Create
          </Link>
        </div>
      </div>

      <Disclaimer />

      {!walletAddress ? (
        <div style={{ textAlign: "center", padding: "3rem 2rem" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
            Connect your wallet to check and claim your capsules.
          </p>
          <WalletConnect onConnected={handleConnected} />
        </div>
      ) : !capsule ? (
        <form onSubmit={handleLookup} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", padding: "0.75rem", borderRadius: "8px", fontSize: "0.9rem" }}>
              {parseContractError(error)}
            </div>
          )}

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Capsule ID
            </label>
            <input
              type="number"
              value={capsuleId}
              onChange={(e) => setCapsuleId(e.target.value)}
              placeholder="Enter capsule ID (e.g. 0)"
              required
              min="0"
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

          <button
            type="submit"
            disabled={loading}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "0.875rem",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Looking up..." : "Look Up Capsule"}
          </button>

          {notFound && (
            <p style={{ color: "var(--text-muted)", textAlign: "center" }}>
              Capsule not found or you are not a beneficiary.
            </p>
          )}
        </form>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <CapsuleCard capsule={capsule} />

          {myAllocation && !myAllocation.claimed && capsule.isUnlocked ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "8px", padding: "1rem" }}>
                <p style={{ color: "var(--success)", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Your allocation: {Number(myAllocation.allocation)}%
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  This capsule is unlocked. You can claim your ETH now.
                </p>
              </div>
              {/* Claim Gas Estimate */}
              {claimGasEstimate && (
                <div style={{
                  background: claimGasEstimate.success ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  border: `1px solid ${claimGasEstimate.success ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
                  borderRadius: "8px",
                  padding: "0.75rem",
                  fontSize: "0.85rem",
                }}>
                  {claimGasEstimate.success ? (
                    <span style={{ color: "var(--success)" }}>
                      Estimated gas: ~{claimGasEstimate.costEth.toFixed(6)} ETH
                    </span>
                  ) : (
                    <span style={{ color: "#ef4444" }}>
                      Gas estimation unavailable: {claimGasEstimate.error}
                    </span>
                  )}
                </div>
              )}
              <button
                onClick={handleClaim}
                disabled={loading}
                style={{
                  background: "var(--success)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "1rem",
                  fontSize: "1rem",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Claiming..." : "Claim ETH"}
              </button>
            </div>
          ) : myAllocation?.claimed ? (
            <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "8px", padding: "1rem", textAlign: "center" }}>
              <p style={{ color: "var(--accent-light)", fontWeight: 600 }}>
                Already Claimed
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
                You have already claimed your allocation from this capsule.
              </p>
            </div>
          ) : (
            <div style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: "8px", padding: "1rem", textAlign: "center" }}>
              <p style={{ color: "var(--accent-light)", fontWeight: 600 }}>
                Not Yet Unlocked
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
                Come back when the lock period has ended.
              </p>
            </div>
          )}

          {/* Message decryption — available after unlock regardless of claim status */}
          {capsule.messageHash && (
            <div style={{ background: "rgba(30,30,50,0.8)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                Encrypted Message
              </p>
              {decryptedMessage ? (
                <div>
                  <p style={{ color: "var(--text)", fontSize: "0.95rem", whiteSpace: "pre-wrap", background: "rgba(34,197,94,0.05)", padding: "0.75rem", borderRadius: "6px", border: "1px solid rgba(34,197,94,0.2)" }}>
                    {decryptedMessage}
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleDecryptMessage}
                  disabled={decrypting}
                  style={{
                    background: "transparent",
                    color: "var(--accent-light)",
                    border: "1px solid var(--accent-light)",
                    borderRadius: "8px",
                    padding: "0.5rem 1rem",
                    fontSize: "0.85rem",
                    cursor: decrypting ? "not-allowed" : "pointer",
                    opacity: decrypting ? 0.7 : 1,
                  }}
                >
                  {decrypting ? "Decrypting..." : "Decrypt Message"}
                </button>
              )}
              {decryptError && (
                <p style={{ color: "#ef4444", fontSize: "0.8rem", marginTop: "0.5rem" }}>
                  Decryption failed: {decryptError}
                </p>
              )}
              {!capsule.isUnlocked && !decryptedMessage && (
                <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.4rem" }}>
                  Capsule must be unlocked before you can decrypt the message.
                </p>
              )}
            </div>
          )}

          <button
            onClick={() => { setCapsule(null); setCapsuleId(""); setMyAllocation(null); setDecryptedMessage(null); setDecryptError(null); setClaimGasEstimate(null); }}
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "0.75rem",
              cursor: "pointer",
            }}
          >
            Look Up Another Capsule
          </button>
        </div>
      )}
    </div>
  );
}
