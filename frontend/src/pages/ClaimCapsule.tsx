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
// [Relay disabled] import { signClaimMessage } from "../lib/eip712";
// [Relay disabled] import { submitClaimSignature, RelayerError } from "../lib/relayer";

type SharePageState = "loading" | "wrong_wallet" | "locked" | "unlocked" | "claimed" | "not_found";

export default function ClaimCapsule() {
  const { founder, capsuleId: urlCapsuleId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isShareMode = Boolean(
    (founder && urlCapsuleId) ||
    (searchParams.get("founder") && searchParams.get("capsuleId"))
  );

  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [capsule, setCapsule] = useState<CapsuleView | null>(null);
  const [myAllocation, setMyAllocation] = useState<{ allocation: bigint; claimed: boolean } | null>(null);
  const [decryptedMessage, setDecryptedMessage] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  const [lookupCapsuleId, setLookupCapsuleId] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [claimGasEstimate, setClaimGasEstimate] = useState<GasEstimateResult | null>(null);

  const [sharePageState, setSharePageState] = useState<SharePageState>("loading");
  const [currentTimestamp, setCurrentTimestamp] = useState<bigint | null>(null);
  const [claiming, setClaiming] = useState(false);

  // [Relay disabled] const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  // [Relay disabled] const [showSignModal, setShowSignModal] = useState(false);
  // [Relay disabled] const [signing, setSigning] = useState(false);
  // [Relay disabled] const [signatureSubmitted, setSignatureSubmitted] = useState(false);
  // [Relay disabled] const [submittedTxHash, setSubmittedTxHash] = useState<string | null>(null);
  // [Relay disabled] const [signatureError, setSignatureError] = useState<string | null>(null);
  // [Relay disabled] const [pendingNonce, setPendingNonce] = useState<number | null>(null);
  // [Relay disabled] const [pendingSignature, setPendingSignature] = useState<string | null>(null);

  const { setNetwork, setProvider } = useNetwork();
  const { showToast } = useToast();
  const { loading, error, setError, getCapsule, getMyAllocation, claimCapsule } = useTimeCapsule();

  // Block timestamp sync (share-link mode)
  useEffect(() => {
    if (!isShareMode) return;
    async function fetchBlockTimestamp() {
      try {
        const ethereum = window.ethereum as ethers.Eip1193Provider | undefined;
        if (!ethereum) return;
        const provider = new ethers.BrowserProvider(ethereum);
        const block = await provider.getBlock("latest");
        if (block) setCurrentTimestamp(BigInt(Number(block.timestamp)));
      } catch { /* ignore */ }
    }
    fetchBlockTimestamp();
    const interval = setInterval(fetchBlockTimestamp, 12000);
    return () => clearInterval(interval);
  }, [isShareMode]);

  async function handleConnected(connSigner: ethers.JsonRpcSigner, address: string) {
    setSigner(connSigner);
    setWalletAddress(address);
    const provider = connSigner.provider as ethers.BrowserProvider;
    if (provider) {
      setProvider(provider);
      try {
        const [network] = await Promise.all([
          provider.getNetwork(),
        ]);
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

  // [Relay disabled] async function handleSignToClaim() { ... }
  // [Relay disabled] function openSignModal() { ... }
  // [Relay disabled] function closeSignModal() { ... }

  function handleCountdownExpire() {
    setSharePageState("unlocked");
    setTimeout(() => {
      const founderParam = founder || searchParams.get("founder") || "";
      const capsuleIdParam = urlCapsuleId || searchParams.get("capsuleId") || "";
      navigate(
        `/claim?founder=${encodeURIComponent(founderParam)}&capsuleId=${encodeURIComponent(capsuleIdParam)}`
      );
    }, 3000);
  }

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

  /* ─────────────────────────────────────────────────────────
     SHARE-LINK MODE
  ───────────────────────────────────────────────────────── */
  if (isShareMode) {
    const id = Number(urlCapsuleId || searchParams.get("capsuleId") || "0");
    const isValidFounder =
      (founder && ethers.isAddress(founder)) ||
      (searchParams.get("founder") && ethers.isAddress(searchParams.get("founder")));

    if (!isValidFounder) {
      return (
        <div className="page-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
          <div className="card text-center" style={{ maxWidth: "480px", margin: "0 auto" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1.5rem" }}>
              <svg width="48" height="48" viewBox="0 0 28 28" fill="none" style={{ margin: "0 auto" }}>
                <rect x="2" y="2" width="24" height="24" rx="2" stroke="#7a6a52" strokeWidth="1.5" fill="none" />
                <path d="M10 8 L14 14 L18 8 M10 20 L14 14" stroke="#7a6a52" strokeWidth="1.3" strokeLinecap="round" fill="none" />
              </svg>
            </div>
            <h2 style={{ marginBottom: "0.75rem" }}>INVALID LINK</h2>
            <p className="text-muted mb-2">This time capsule link is invalid.</p>
            <Link to="/create" className="link-arrow">Create Your Own Capsule →</Link>
          </div>
        </div>
      );
    }

    if (sharePageState === "loading") {
      return (
        <div className="page-container" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
          <div style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
            <div className="spinner spinner-lg" />
            <p className="text-muted">Connecting to capsule...</p>
          </div>
          <WalletConnect onConnected={handleConnected} />
        </div>
      );
    }

    if (sharePageState === "wrong_wallet") {
      return (
        <div className="page-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
          <div className="card text-center" style={{ maxWidth: "480px", margin: "0 auto" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1.5rem" }}>
              <svg width="48" height="48" viewBox="0 0 28 28" fill="none" style={{ margin: "0 auto" }}>
                <rect x="2" y="2" width="24" height="24" rx="2" stroke="#ff4d4d" strokeWidth="1.5" fill="none" opacity="0.7" />
                <line x1="9" y1="9" x2="19" y2="19" stroke="#ff4d4d" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <h2 style={{ marginBottom: "1rem", color: "var(--danger)" }}>NOT YOUR CAPSULE</h2>
            <p className="text-muted" style={{ lineHeight: 1.6 }}>This time capsule was not created for your wallet address.</p>
            <Link to="/create" className="link-arrow mt-2">Create Your Own Capsule →</Link>
          </div>
        </div>
      );
    }

    if (sharePageState === "not_found") {
      return (
        <div className="page-container" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
          <div className="card text-center" style={{ maxWidth: "480px", margin: "0 auto" }}>
            <h2 style={{ marginBottom: "0.75rem" }}>CAPSULE NOT FOUND</h2>
            <p className="text-muted mb-2">This capsule does not exist or has already been withdrawn.</p>
            <Link to="/create" className="link-arrow">Create Your Own Capsule →</Link>
          </div>
        </div>
      );
    }

    if (sharePageState === "claimed") {
      const ethAmount = capsule ? ethers.formatEther(capsule.depositedValue) : "0";
      return (
        <div className="page-container" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
          <div className="card text-center" style={{ maxWidth: "480px", width: "100%" }}>
            <div className="text-success" style={{ fontSize: "3rem", marginBottom: "1.5rem" }}>
              <svg width="48" height="48" viewBox="0 0 28 28" fill="none" style={{ margin: "0 auto" }}>
                <rect x="2" y="2" width="24" height="24" rx="2" stroke="#39ff8f" strokeWidth="1.5" fill="none" />
                <path d="M8 14 L12 18 L20 10" stroke="#39ff8f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 style={{ marginBottom: "0.75rem", color: "var(--success)" }}>ALREADY CLAIMED</h2>
            <p className="text-muted mb-2">This capsule has been claimed.</p>
            <p className="text-xl font-bold text-accent mb-2">{ethAmount} ETH</p>
            <Link to="/create" className="link-arrow">Create Your Own Capsule →</Link>
          </div>
        </div>
      );
    }

    // Locked / Unlocked
    const ethAmount = capsule ? ethers.formatEther(capsule.depositedValue) : "0";
    const isLocked = sharePageState === "locked";

    return (
      <div className="page-container" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
        <div className="card animate-in" style={{ maxWidth: "480px", width: "100%", textAlign: "center" }}>

          {/* Vault icon */}
          <div style={{ marginBottom: "1rem" }}>
            {isLocked ? (
              <svg width="48" height="48" viewBox="0 0 28 28" fill="none" style={{ margin: "0 auto" }}>
                <rect x="2" y="2" width="24" height="24" rx="2" stroke="#7a6a52" strokeWidth="1.5" fill="none" opacity="0.8" />
                <rect x="8" y="12" width="12" height="10" rx="1" stroke="#7a6a52" strokeWidth="1.2" fill="none" />
                <path d="M10 12 L10 9 A4 4 0 0 1 18 9 L18 12" stroke="#7a6a52" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                <circle cx="14" cy="17" r="1.2" fill="#7a6a52" />
              </svg>
            ) : (
              <svg width="48" height="48" viewBox="0 0 28 28" fill="none" style={{ margin: "0 auto" }}>
                <rect x="2" y="2" width="24" height="24" rx="2" stroke="#39ff8f" strokeWidth="1.5" fill="none" />
                <path d="M8 14 L12 18 L20 10" stroke="#39ff8f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>

          {/* Status label */}
          <p className={`text-xs font-bold tracking-wide mb-2 ${isLocked ? "text-muted" : "text-success"}`} style={{ letterSpacing: "0.1em" }}>
            {isLocked ? "INCOMING TIME CAPSULE" : "TIME CAPSULE UNLOCKED"}
          </p>

          {/* ETH Amount */}
          <div className="text-xl font-bold text-accent mb-1" style={{ fontSize: "2.5rem" }}>
            {ethAmount} ETH
          </div>

          <div className="divider" style={{ margin: "1.25rem auto" }} />

          {/* Countdown */}
          {isLocked && capsule && (
            <div className="mb-2">
              <CountdownTimer
                unlockTimestamp={capsule.unlockTimestamp}
                currentTimestamp={currentTimestamp ?? undefined}
                compact
                onExpire={handleCountdownExpire}
              />
            </div>
          )}

          {/* Action button */}
          {isLocked ? (
            <button className="btn btn-ghost btn-full" disabled>
              Locked — Come Back When Timer Ends
            </button>
          ) : (
            <button
              className="btn btn-success btn-full btn-lg"
              onClick={handleClaim}
              disabled={claiming}
            >
              {claiming ? "Claiming..." : "Claim ETH Now"}
            </button>
          )}

          {/* Footer */}
          <p className="text-muted text-xs mt-2">
            #{id} · {capsule?.beneficiaryCount ?? 0} beneficiary{(capsule?.beneficiaryCount ?? 0) !== 1 ? "s" : ""}
          </p>

          {/* Encrypted message */}
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
              <div className="card mt-2" style={{ textAlign: "left", padding: "1rem" }}>
                <p className="text-muted text-xs mb-1">Encrypted Message</p>
                {!isPrimaryBeneficiary ? (
                  <p className="text-muted text-sm">
                    This message was encrypted for the primary beneficiary (
                    <span className="font-mono text-accent">
                      {primaryBeneficiary!.slice(0, 6)}...{primaryBeneficiary!.slice(-4)}
                    </span>
                    ). Connect with that wallet to decrypt it.
                  </p>
                ) : decryptedMessage ? (
                  <p className="text" style={{ whiteSpace: "pre-wrap", background: "var(--success-dim)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid rgba(57,255,143,0.2)", fontSize: "0.875rem" }}>
                    {decryptedMessage}
                  </p>
                ) : (
                  <button
                    className="btn btn-sm"
                    onClick={handleDecryptMessage}
                    disabled={decrypting}
                  >
                    {decrypting ? "Decrypting..." : "Decrypt Message"}
                  </button>
                )}
                {decryptError && (
                  <p className="text-danger text-xs mt-1">Decryption failed: {decryptError}</p>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────
     NORMAL LOOKUP MODE
  ───────────────────────────────────────────────────────── */
  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Claim Capsule</h2>
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted font-mono">
            {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Not connected"}
          </span>
          <Link to="/create" className="link-arrow">← Create</Link>
        </div>
      </div>

      {!walletAddress ? (
        <div className="text-center" style={{ padding: "3rem 2rem" }}>
          <p className="text-muted mb-2">Connect your wallet to check and claim your capsules.</p>
          <WalletConnect onConnected={handleConnected} />
        </div>
      ) : !capsule ? (
        <form onSubmit={handleLookup} className="card">
          {error && (
            <div className="alert alert-danger">{parseContractError(error)}</div>
          )}

          <div className="form-group mb-2">
            <label className="label">Capsule ID</label>
            <input
              type="number"
              className="input"
              value={lookupCapsuleId}
              onChange={(e) => setLookupCapsuleId(e.target.value)}
              placeholder="Enter capsule ID (e.g. 0)"
              required
              min="0"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
          >
            {loading ? "Looking up..." : "Look Up Capsule"}
          </button>

          {notFound && (
            <p className="text-muted text-center mt-1">Capsule not found or you are not a beneficiary.</p>
          )}
        </form>
      ) : (
        <div className="flex flex-col gap-2 animate-in">
          <CapsuleCard capsule={capsule} />

          {myAllocation?.claimed ? (
            <div className="card text-center" style={{ padding: "1rem" }}>
              <p className="text-accent font-bold">Already Claimed</p>
              <p className="text-muted text-sm mt-1">
                You have already claimed your allocation from this capsule.
              </p>
            </div>
          ) : capsule.isUnlocked ? (
            <div className="flex flex-col gap-1">
              {myAllocation && (
                <div className="card" style={{ padding: "1rem" }}>
                  <div className="text-success font-bold mb-1">
                    Your allocation: {Number(myAllocation.allocation)}%
                  </div>
                  <p className="text-muted text-sm">
                    This capsule is unlocked. You can claim your ETH now.
                  </p>
                </div>
              )}

              {claimGasEstimate && (
                <div className={`alert ${claimGasEstimate.success ? "alert-success" : "alert-danger"}`}>
                  {claimGasEstimate.success ? (
                    <span className="text-success">
                      Estimated gas: ~{claimGasEstimate.costEth.toFixed(6)} ETH
                    </span>
                  ) : (
                    <span className="text-danger">
                      Gas estimation unavailable: {claimGasEstimate.error}
                    </span>
                  )}
                </div>
              )}

              <button
                className="btn btn-success btn-full btn-lg"
                onClick={handleClaim}
                disabled={claiming}
              >
                {claiming ? "Claiming..." : "Claim ETH"}
              </button>
            </div>
          ) : (
            <div className="card text-center" style={{ padding: "1rem" }}>
              <p className="text-accent font-bold">Not Yet Unlocked</p>
              <p className="text-muted text-sm mt-1">
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
              <div className="card" style={{ padding: "1rem" }}>
                <p className="text-muted text-xs mb-1">Encrypted Message</p>
                {!isPrimaryBeneficiary ? (
                  <p className="text-muted text-sm">
                    This message was encrypted for the primary beneficiary (
                    <span className="font-mono text-accent">
                      {primaryBeneficiary!.slice(0, 6)}...{primaryBeneficiary!.slice(-4)}
                    </span>
                    ) only. Connect with that wallet to decrypt it.
                  </p>
                ) : decryptedMessage ? (
                  <p className="text" style={{ whiteSpace: "pre-wrap", background: "var(--success-dim)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid rgba(57,255,143,0.2)", fontSize: "0.875rem" }}>
                    {decryptedMessage}
                  </p>
                ) : (
                  <button
                    className="btn btn-sm"
                    onClick={handleDecryptMessage}
                    disabled={decrypting}
                  >
                    {decrypting ? "Decrypting..." : "Decrypt Message"}
                  </button>
                )}
                {decryptError && (
                  <p className="text-danger text-xs mt-1">Decryption failed: {decryptError}</p>
                )}
                {!capsule.isUnlocked && !decryptedMessage && isPrimaryBeneficiary && (
                  <p className="text-muted text-xs mt-1">
                    Capsule must be unlocked before you can decrypt the message.
                  </p>
                )}
              </div>
            );
          })()}

          <button
            className="btn btn-ghost"
            onClick={() => {
              setCapsule(null);
              setLookupCapsuleId("");
              setMyAllocation(null);
              setDecryptedMessage(null);
              setDecryptError(null);
              setClaimGasEstimate(null);
              setNotFound(false);
            }}
          >
            Look Up Another Capsule
          </button>
        </div>
      )}

      {/* [Relay disabled] Signature Relay Modal */}
      {/*
      {showSignModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeSignModal(); }}>
          <div className="card animate-in" style={{ maxWidth: "480px", width: "100%", textAlign: "center" }}>
            {!signatureSubmitted ? (
              <>
                <h3 className="mb-2">Sign to Claim</h3>
                <p className="text-muted text-sm mb-2">You don't need ETH to claim — just sign this message and the relayer will submit the transaction for you.</p>
                {capsule && walletAddress && (
                  <div className="card mb-2" style={{ textAlign: "left", padding: "0.75rem", background: "var(--bg-secondary)" }}>
                    <p className="text-xs text-muted mb-1">Data to sign:</p>
                    <div className="flex flex-col gap-05">
                      <div className="flex justify-between"><span className="text-sm text-muted">Capsule ID</span><span className="text-sm font-mono">{capsule.id}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-muted">Your address</span><span className="text-sm font-mono">{walletAddress.slice(0,6)}...{walletAddress.slice(-4)}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-muted">Nonce</span><span className="text-sm font-mono">{pendingNonce !== null ? pendingNonce : "—"}</span></div>
                    </div>
                  </div>
                )}
                {signatureError && (<div className="alert alert-danger mb-2" style={{ textAlign: "left", fontSize: "0.85rem" }}>{signatureError}</div>)}
                <div className="flex gap-1">
                  <button className="btn btn-ghost" onClick={closeSignModal} disabled={signing} style={{ flex: 1 }}>Cancel</button>
                  {!pendingSignature ? (
                    <button className="btn btn-primary" onClick={handleSignToClaim} disabled={signing || pendingNonce === null} style={{ flex: 2 }}>{signing ? "Waiting for signature..." : "Sign & Submit"}</button>
                  ) : (
                    <button className="btn btn-primary" onClick={handleSignToClaim} disabled={signing} style={{ flex: 2 }}>{signing ? "Submitting to relayer..." : "Submit to Relayer"}</button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>
                  <svg width="48" height="48" viewBox="0 0 28 28" fill="none" style={{ margin: "0 auto" }}>
                    <rect x="2" y="2" width="24" height="24" rx="2" stroke="#39ff8f" strokeWidth="1.5" fill="none" />
                    <path d="M8 14 L12 18 L20 10" stroke="#39ff8f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="mb-1" style={{ color: "var(--success)" }}>Signature Submitted!</h3>
                <p className="text-muted text-sm mb-2">The relayer will process your claim shortly. This usually takes 1-2 minutes.</p>
                {submittedTxHash && (<p className="text-xs text-muted mb-2">Tx Hash: <span className="font-mono">{submittedTxHash.slice(0,10)}...{submittedTxHash.slice(-8)}</span></p>)}
                <button className="btn btn-primary btn-full" onClick={closeSignModal}>Close</button>
              </>
            )}
          </div>
        </div>
      )}
      */}
    </div>
  );
}
