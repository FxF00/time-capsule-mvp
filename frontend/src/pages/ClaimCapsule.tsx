import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTimeCapsule } from "../hooks/useTimeCapsule";
import WalletConnect from "../components/WalletConnect";
import CountdownTimer from "../components/CountdownTimer";
import CapsuleCard from "../components/CapsuleCard";
import type { CapsuleView } from "../hooks/useTimeCapsule";
import { decryptStoredMessage } from "../lib/ipfs";
import { getVaultContract, estimateGas, type GasEstimateResult } from "../lib/contracts";
import { useNetwork, getNetworkInfo } from "../contexts/NetworkContext";
import { useToast } from "../components/Toast";
import { parseContractError } from "../lib/errors";

type SharePageState = "loading" | "wrong_wallet" | "locked" | "unlocked" | "claimed" | "not_found";

export default function ClaimCapsule() {
  const { founder, capsuleId: urlCapsuleId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isShareMode = Boolean(
    (founder && urlCapsuleId) ||
    (searchParams.get("founder") && searchParams.get("capsuleId"))
  );

  // ── Shared state ──────────────────────────────────────────────
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [capsule, setCapsule] = useState<CapsuleView | null>(null);
  const [myAllocation, setMyAllocation] = useState<{ allocation: bigint; claimed: boolean } | null>(null);
  const [decryptedMessage, setDecryptedMessage] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  // Normal (lookup) mode state
  const [lookupCapsuleId, setLookupCapsuleId] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [claimGasEstimate, setClaimGasEstimate] = useState<GasEstimateResult | null>(null);

  // Share-link mode state
  const [sharePageState, setSharePageState] = useState<SharePageState>("loading");
  const [currentTimestamp, setCurrentTimestamp] = useState<bigint | null>(null);
  const [claiming, setClaiming] = useState(false);

  const { setNetwork, setProvider } = useNetwork();
  const { showToast } = useToast();
  const { loading, error, setError, getCapsule, getMyAllocation, claimCapsule } = useTimeCapsule();

  // ── Block timestamp sync (share-link mode) ──────────────────────
  useEffect(() => {
    if (!isShareMode) return;
    async function fetchBlockTimestamp() {
      try {
        const ethereum = window.ethereum as ethers.Eip1193Provider | undefined;
        if (!ethereum) return;
        const provider = new ethers.BrowserProvider(ethereum);
        const block = await provider.getBlock("latest");
        if (block) setCurrentTimestamp(BigInt(Number(block.timestamp)));
      } catch { /* ignore — CountdownTimer falls back to Date.now() */ }
    }
    fetchBlockTimestamp();
    const interval = setInterval(fetchBlockTimestamp, 12000);
    return () => clearInterval(interval);
  }, [isShareMode]);

  // ── Wallet connection handler (both modes) ─────────────────────
  async function handleConnected(connSigner: ethers.JsonRpcSigner, address: string) {
    setSigner(connSigner);
    setWalletAddress(address);

    const provider = connSigner.provider as ethers.BrowserProvider;
    if (provider) {
      setProvider(provider);
      try {
        const network = await provider.getNetwork();
        setNetwork(getNetworkInfo(network));
      } catch (err) {
        console.warn("Failed to detect network:", err);
      }
    }

    if (isShareMode) {
      await loadShareCapsule(connSigner);
    }
  }

  async function loadShareCapsule(connSigner: ethers.JsonRpcSigner) {
    const id = Number(urlCapsuleId || searchParams.get("capsuleId") || "0");
    const data = await getCapsule(id, connSigner);
    if (!data) {
      setSharePageState("not_found");
      return;
    }
    setCapsule(data);

    const allocData = await getMyAllocation(id, connSigner);
    setMyAllocation(allocData);

    if (data.isWithdrawn) {
      setSharePageState("claimed");
    } else if (data.isUnlocked) {
      setSharePageState("unlocked");
    } else {
      setSharePageState("locked");
    }
  }

  // ── Lookup mode ───────────────────────────────────────────────
  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!signer) return;
    setError(null);
    setNotFound(false);

    const id = Number(lookupCapsuleId);
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

    if (allocationData && !allocationData.claimed && capsuleData.isUnlocked && signer) {
      try {
        const contract = getVaultContract(signer) as ethers.Contract;
        const result = await estimateGas(signer, contract.claim, [id]);
        setClaimGasEstimate(result);
      } catch (err: any) {
        setClaimGasEstimate({ success: false, error: err.message || "Gas estimation failed" });
      }
    } else {
      setClaimGasEstimate(null);
    }
  }

  // ── Claim (both modes) ────────────────────────────────────────
  async function handleClaim() {
    if (!signer || !capsule) return;
    setClaiming(true);
    try {
      const success = await claimCapsule(capsule.id, signer);
      if (success) {
        showToast("success", "Transaction submitted!");
        const updated = await getCapsule(capsule.id, signer);
        if (updated) setCapsule(updated);
        if (isShareMode) {
          setSharePageState("claimed");
        }
      }
    } finally {
      setClaiming(false);
    }
  }

  function handleCountdownExpire() {
    setSharePageState("unlocked");
    // 3 秒后跳转到 /claim
    setTimeout(() => {
      const founderParam = founder || searchParams.get("founder") || "";
      const capsuleIdParam = urlCapsuleId || searchParams.get("capsuleId") || "";
      navigate(
        `/claim?founder=${encodeURIComponent(founderParam)}&capsuleId=${encodeURIComponent(capsuleIdParam)}`
      );
    }, 3000);
  }

  // ── Decrypt (both modes) ──────────────────────────────────────
  async function handleDecryptMessage() {
    if (!capsule || !walletAddress || !signer) return;
    setDecrypting(true);
    setDecryptError(null);
    try {
      const contract = getVaultContract(signer) as ethers.Contract;
      const unlockTimestamp = await contract.getUnlockTimestamp(capsule.id);
      const message = await decryptStoredMessage(walletAddress, unlockTimestamp, capsule.messageHash);
      setDecryptedMessage(message);
    } catch (err: any) {
      setDecryptError(err.message || "Decryption failed");
    } finally {
      setDecrypting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  SHARE-LINK MODE (via /receive/:founder/:capsuleId)
  // ─────────────────────────────────────────────────────────────
  if (isShareMode) {
    const id = Number(urlCapsuleId || searchParams.get("capsuleId") || "0");
    const isValidFounder = (founder && ethers.isAddress(founder)) || (searchParams.get("founder") && ethers.isAddress(searchParams.get("founder")));

    // ── Invalid URL ──
    if (!isValidFounder) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: "2rem" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "4rem", marginBottom: "1.5rem" }}>🔗</div>
            <h2 style={{ marginBottom: "0.75rem", fontSize: "1.5rem", fontWeight: 700, letterSpacing: "0.05em" }}>INVALID LINK</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginBottom: "2rem" }}>
              This time capsule link is invalid.
            </p>
            <Link to="/create" style={{ color: "var(--accent-light)", fontSize: "0.95rem" }}>
              Create Your Own Capsule
            </Link>
          </div>
        </div>
      );
    }

    // ── Loading / Wallet connect ──
    if (sharePageState === "loading") {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: "2rem" }}>
          <div style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
            <div style={{ width: "40px", height: "40px", border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>Connecting to capsule...</p>
          </div>
          <WalletConnect onConnected={handleConnected} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    // ── Wrong wallet (not a beneficiary) ──
    if (sharePageState === "wrong_wallet") {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: "2rem" }}>
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "16px", padding: "3rem 2.5rem", maxWidth: "480px", margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "1.5rem" }}>🔒</div>
            <h2 style={{ marginBottom: "1rem", color: "#ef4444", fontSize: "1.5rem", fontWeight: 700 }}>
              NOT YOUR CAPSULE
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6 }}>
              This time capsule was not created for your wallet address.
            </p>
            <Link to="/create" style={{ color: "var(--accent-light)", marginTop: "2rem", display: "inline-block", fontSize: "0.9rem" }}>
              Create Your Own Capsule
            </Link>
          </div>
        </div>
      );
    }

    // ── Capsule not found ──
    if (sharePageState === "not_found") {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: "2rem" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "4rem", marginBottom: "1.5rem" }}>💔</div>
            <h2 style={{ marginBottom: "0.75rem", fontSize: "1.5rem", fontWeight: 700, letterSpacing: "0.05em" }}>CAPSULE NOT FOUND</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginBottom: "2rem" }}>
              This capsule does not exist or has already been withdrawn.
            </p>
            <Link to="/create" style={{ color: "var(--accent-light)", fontSize: "0.95rem" }}>
              Create Your Own Capsule
            </Link>
          </div>
        </div>
      );
    }

    // ── Claimed ──
    if (sharePageState === "claimed") {
      const ethAmount = capsule ? ethers.formatEther(capsule.depositedValue) : "0";
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: "2rem" }}>
          <div style={{ maxWidth: "480px", textAlign: "center" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "1.5rem" }}>✅</div>
            <h2 style={{ marginBottom: "0.75rem", color: "var(--accent-light)", fontSize: "1.75rem", letterSpacing: "0.05em" }}>ALREADY CLAIMED</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "1rem", marginBottom: "2.5rem" }}>
              This capsule has been claimed.
            </p>
            <p style={{ fontSize: "2.5rem", fontWeight: 700, color: "var(--accent)", marginBottom: "2.5rem" }}>
              {ethAmount} ETH
            </p>
            <Link to="/create" style={{ color: "var(--accent-light)", fontSize: "1rem" }}>
              Create Your Own Capsule
            </Link>
          </div>
        </div>
      );
    }

    // ── Locked / Unlocked (share mode — centered capsule UI) ──
    const ethAmount = capsule ? ethers.formatEther(capsule.depositedValue) : "0";

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: "2rem" }}>
        <div style={{ maxWidth: "480px", width: "100%", textAlign: "center" }}>

          {/* Capsule icon */}
          <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>
            {sharePageState === "locked" ? "📦" : "🔓"}
          </div>

          {/* Status label */}
          <p style={{
            color: sharePageState === "locked" ? "var(--text-muted)" : "var(--success)",
            fontSize: "0.85rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            marginBottom: "1.5rem",
          }}>
            {sharePageState === "locked" ? "⏳ INCOMING TIME CAPSULE" : "🔓 TIME CAPSULE UNLOCKED"}
          </p>

          {/* ETH Amount */}
          <div style={{ fontSize: "3rem", fontWeight: 700, color: "var(--accent)", marginBottom: "0.5rem" }}>
            {ethAmount} ETH
          </div>

          <div style={{ width: "60px", height: "1px", background: "var(--border)", margin: "1.5rem auto" }} />

          {/* Countdown timer (locked only) */}
          {sharePageState === "locked" && capsule && (
            <div style={{ marginBottom: "2rem" }}>
              <CountdownTimer
                unlockTimestamp={capsule.unlockTimestamp}
                currentTimestamp={currentTimestamp ?? undefined}
                compact
                onExpire={handleCountdownExpire}
              />
            </div>
          )}

          {/* Locked → disabled button; Unlocked → claim */}
          {sharePageState === "locked" ? (
            <button
              disabled
              style={{
                width: "100%",
                padding: "1rem",
                borderRadius: "10px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                fontSize: "0.95rem",
                fontWeight: 600,
                cursor: "not-allowed",
              }}
            >
              Locked — Come Back When Timer Ends
            </button>
          ) : (
            <button
              onClick={handleClaim}
              disabled={claiming}
              style={{
                width: "100%",
                padding: "1rem",
                borderRadius: "10px",
                background: "var(--success)",
                border: "none",
                color: "#fff",
                fontSize: "1rem",
                fontWeight: 700,
                cursor: claiming ? "not-allowed" : "pointer",
                opacity: claiming ? 0.7 : 1,
              }}
            >
              {claiming ? "Claiming..." : "Claim ETH Now"}
            </button>
          )}

          {/* Footer */}
          <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "1.5rem" }}>
            #{id} · {capsule?.beneficiaryCount ?? 0} beneficiary{(capsule?.beneficiaryCount ?? 0) !== 1 ? "s" : ""}
          </p>

          {/* Encrypted message (share mode — decrypted after unlock) */}
          {capsule?.messageHash && sharePageState === "unlocked" && (() => {
            let storedPrimaryBeneficiary: string | null = null;
            try {
              storedPrimaryBeneficiary = sessionStorage.getItem(`capsule_${capsule.founder}_${capsule.id}_primary_beneficiary`);
            } catch { /* unavailable */ }

            const onChainPrimary = capsule.primaryBeneficiary;
            const primaryBeneficiary = onChainPrimary || storedPrimaryBeneficiary;
            const isPrimaryBeneficiary =
              !primaryBeneficiary ||
              walletAddress?.toLowerCase() === primaryBeneficiary.toLowerCase();

            return (
              <div style={{ marginTop: "1.5rem", background: "rgba(30,30,50,0.8)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem", textAlign: "left" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                  Encrypted Message
                </p>
                {!isPrimaryBeneficiary ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    This message was encrypted for the primary beneficiary (
                    <span style={{ fontFamily: "monospace", color: "var(--accent)" }}>
                      {primaryBeneficiary!.slice(0, 6)}...{primaryBeneficiary!.slice(-4)}
                    </span>
                    ). Connect with that wallet to decrypt it.
                  </p>
                ) : decryptedMessage ? (
                  <p style={{ color: "var(--text)", fontSize: "0.95rem", whiteSpace: "pre-wrap", background: "rgba(34,197,94,0.05)", padding: "0.75rem", borderRadius: "6px", border: "1px solid rgba(34,197,94,0.2)" }}>
                    {decryptedMessage}
                  </p>
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
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  //  NORMAL LOOKUP MODE (via /claim)
  // ─────────────────────────────────────────────────────────────

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

      {/* No wallet connected */}
      {!walletAddress ? (
        <div style={{ textAlign: "center", padding: "3rem 2rem" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
            Connect your wallet to check and claim your capsules.
          </p>
          <WalletConnect onConnected={handleConnected} />
        </div>
      ) : !capsule ? (
        /* Lookup form */
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
              value={lookupCapsuleId}
              onChange={(e) => setLookupCapsuleId(e.target.value)}
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
        /* Capsule detail + claim + decrypt */
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
            <div style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,236,0.3)", borderRadius: "8px", padding: "1rem", textAlign: "center" }}>
              <p style={{ color: "var(--accent-light)", fontWeight: 600 }}>
                Not Yet Unlocked
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
                Come back when the lock period has ended.
              </p>
            </div>
          )}

          {/* Message decryption */}
          {capsule.messageHash && (() => {
            let storedPrimaryBeneficiary: string | null = null;
            try {
              storedPrimaryBeneficiary = sessionStorage.getItem(`capsule_${capsule.founder}_${capsule.id}_primary_beneficiary`);
            } catch { /* unavailable */ }

            const onChainPrimary = capsule.primaryBeneficiary;
            const primaryBeneficiary = onChainPrimary || storedPrimaryBeneficiary;
            const isPrimaryBeneficiary =
              !primaryBeneficiary ||
              walletAddress?.toLowerCase() === primaryBeneficiary.toLowerCase();

            return (
              <div style={{ background: "rgba(30,30,50,0.8)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                  Encrypted Message
                </p>
                {!isPrimaryBeneficiary ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    This message was encrypted for the primary beneficiary (
                    <span style={{ fontFamily: "monospace", color: "var(--accent)" }}>
                      {primaryBeneficiary!.slice(0, 6)}...{primaryBeneficiary!.slice(-4)}
                    </span>
                    ) only. Connect with that wallet to decrypt it.
                  </p>
                ) : decryptedMessage ? (
                  <p style={{ color: "var(--text)", fontSize: "0.95rem", whiteSpace: "pre-wrap", background: "rgba(34,197,94,0.05)", padding: "0.75rem", borderRadius: "6px", border: "1px solid rgba(34,197,94,0.2)" }}>
                    {decryptedMessage}
                  </p>
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
                {!capsule.isUnlocked && !decryptedMessage && isPrimaryBeneficiary && (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.4rem" }}>
                    Capsule must be unlocked before you can decrypt the message.
                  </p>
                )}
              </div>
            );
          })()}

          <button
            onClick={() => {
              setCapsule(null);
              setLookupCapsuleId("");
              setMyAllocation(null);
              setDecryptedMessage(null);
              setDecryptError(null);
              setClaimGasEstimate(null);
              setNotFound(false);
            }}
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
