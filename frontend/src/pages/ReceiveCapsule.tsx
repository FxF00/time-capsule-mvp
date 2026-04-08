import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useParams, Link } from "react-router-dom";
import WalletConnect from "../components/WalletConnect";
import CountdownTimer from "../components/CountdownTimer";
import { useTimeCapsule } from "../hooks/useTimeCapsule";
import { decryptStoredMessage } from "../lib/ipfs";
import type { CapsuleView } from "../hooks/useTimeCapsule";

type PageState = "loading" | "no_wallet" | "wrong_wallet" | "locked" | "unlocked" | "claimed" | "not_found";

export default function ReceiveCapsule() {
  const { founder, capsuleId } = useParams();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [capsule, setCapsule] = useState<CapsuleView | null>(null);
  const [decryptedMessage, setDecryptedMessage] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const { getCapsule, claimCapsule } = useTimeCapsule();

  // Parse capsule ID from URL
  const id = Number(capsuleId);

  // Validate founder address
  const isValidFounder = founder && ethers.isAddress(founder);

  async function loadCapsule(signer: ethers.JsonRpcSigner) {
    const data = await getCapsule(id, signer);
    if (!data) {
      setPageState("not_found");
      return;
    }
    setCapsule(data);

    if (data.isWithdrawn) {
      setPageState("claimed");
    } else if (data.isUnlocked) {
      setPageState("unlocked");
      // Auto-decrypt message
      if (data.messageHash) {
        setDecrypting(true);
        try {
          const msg = await decryptStoredMessage(signer.address, data.unlockTimestamp, data.messageHash);
          setDecryptedMessage(msg);
        } catch {
          // Decrypt failed silently — message may not exist
        }
        setDecrypting(false);
      }
    } else {
      setPageState("locked");
    }
  }

  async function handleConnected(signer: ethers.JsonRpcSigner, address: string) {
    setWalletAddress(address);
    if (!isValidFounder) {
      setPageState("not_found");
      return;
    }
    await loadCapsule(signer);
  }

  async function handleClaim() {
    if (!capsule) return;
    setClaiming(true);
    try {
      const ethereum = window.ethereum as ethers.Eip1193Provider | undefined;
      if (!ethereum) return;
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const success = await claimCapsule(capsule.id, signer);
      if (success) {
        const updated = await getCapsule(capsule.id, signer);
        if (updated) setCapsule(updated);
        setPageState("claimed");
      }
    } catch {
      // error handled by hook
    } finally {
      setClaiming(false);
    }
  }

  function handleCountdownExpire(signer: ethers.JsonRpcSigner) {
    if (capsule?.messageHash) {
      setDecrypting(true);
      decryptStoredMessage(signer.address, capsule.unlockTimestamp, capsule.messageHash)
        .then(setDecryptedMessage)
        .catch(() => {})
        .finally(() => setDecrypting(false));
    }
    setPageState("unlocked");
  }

  // Helper: connect wallet and get signer
  async function getSigner(): Promise<ethers.JsonRpcSigner | null> {
    const ethereum = window.ethereum as ethers.Eip1193Provider | undefined;
    if (!ethereum) return null;
    const provider = new ethers.BrowserProvider(ethereum);
    return provider.getSigner();
  }

  if (!isValidFounder) {
    return (
      <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>Invalid Link</h2>
        <p style={{ color: "var(--text-muted)" }}>This time capsule link is invalid.</p>
        <Link to="/create" style={{ color: "var(--accent-light)", marginTop: "1rem", display: "inline-block" }}>
          Create a Capsule →
        </Link>
      </div>
    );
  }

  if (pageState === "loading") {
    return (
      <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading capsule...</p>
        <WalletConnect onConnected={handleConnected} />
      </div>
    );
  }

  if (pageState === "no_wallet") {
    return (
      <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>Incoming Time Capsule</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
          Connect your wallet to reveal the capsule from{" "}
          <span style={{ fontFamily: "monospace", color: "var(--accent)" }}>
            {founder?.slice(0, 6)}...{founder?.slice(-4)}
          </span>
        </p>
        <WalletConnect onConnected={handleConnected} />
      </div>
    );
  }

  if (pageState === "wrong_wallet") {
    return (
      <div style={{ textAlign: "center", padding: "3rem 2rem" }}>
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "16px", padding: "2.5rem", maxWidth: "480px", margin: "0 auto" }}>
          <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>🔒</div>
          <h2 style={{ marginBottom: "1.5rem", color: "#ef4444" }}>This Capsule is Not For You</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
            You're connected as
          </p>
          <p style={{ fontFamily: "monospace", color: "var(--text)", fontSize: "0.9rem", marginBottom: "1rem" }}>
            {walletAddress?.slice(0, 8)}...{walletAddress?.slice(-6)}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "0.5rem" }}>but this capsule belongs to</p>
          <p style={{ fontFamily: "monospace", color: "var(--accent)", fontSize: "0.9rem" }}>
            {capsule?.founder?.slice(0, 8)}...{capsule?.founder?.slice(-6)}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "2rem" }}>
            Only the intended beneficiary can claim this capsule.
          </p>
        </div>
      </div>
    );
  }

  if (pageState === "not_found") {
    return (
      <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>Capsule Not Found</h2>
        <p style={{ color: "var(--text-muted)" }}>This capsule does not exist or has been withdrawn.</p>
        <Link to="/create" style={{ color: "var(--accent-light)", marginTop: "1rem", display: "inline-block" }}>
          Create a Capsule →
        </Link>
      </div>
    );
  }

  if (pageState === "claimed") {
    return (
      <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "16px", padding: "2.5rem", maxWidth: "480px", margin: "0 auto" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>✅</div>
          <h2 style={{ marginBottom: "1rem", color: "var(--accent-light)" }}>Already Claimed</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            This capsule has already been claimed.
          </p>
          <Link to="/create" style={{ color: "var(--accent-light)", marginTop: "1.5rem", display: "inline-block" }}>
            Create Your Own Capsule →
          </Link>
        </div>
      </div>
    );
  }

  // States: locked | unlocked
  const isLocked = pageState === "locked";
  const ethAmount = capsule ? parseFloat(ethers.formatEther(capsule.depositedValue)).toFixed(4) : "0";
  const signerPromise = getSigner();

  return (
    <div style={{ textAlign: "center", padding: "3rem 2rem" }}>
      <div style={{ maxWidth: "480px", margin: "0 auto" }}>
        {/* Header */}
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
          Incoming Time Capsule
        </p>
        <p style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--accent)", marginBottom: "2rem" }}>
          From: {founder?.slice(0, 8)}...{founder?.slice(-6)}
        </p>

        {/* ETH Amount */}
        <div style={{ fontSize: "3.5rem", fontWeight: 700, color: "var(--accent)", marginBottom: "0.25rem" }}>
          {ethAmount} ETH
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "2rem" }}>Deposited Value</p>

        {/* Message Box */}
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.25rem", marginBottom: "2rem", textAlign: "left" }}>
          <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            {isLocked ? "Encrypted Message" : "Your Personal Message"}
          </p>
          {isLocked ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", fontStyle: "italic" }}>
              Message is encrypted. It will be revealed after the unlock time.
            </p>
          ) : decrypting ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", fontStyle: "italic" }}>
              Decrypting...
            </p>
          ) : decryptedMessage ? (
            <p style={{ color: "var(--text)", fontSize: "0.95rem", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {decryptedMessage}
            </p>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", fontStyle: "italic" }}>
              No message was attached to this capsule.
            </p>
          )}
        </div>

        {/* Status / Countdown */}
        {isLocked ? (
          <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
            <p style={{ color: "#f59e0b", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem" }}>
              Unlocks in
            </p>
            <CountdownTimer
              unlockTimestamp={capsule!.unlockTimestamp}
              onExpire={async () => {
                const signer = await signerPromise;
                if (signer) handleCountdownExpire(signer);
              }}
            />
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.75rem" }}>
              Come back when the timer reaches zero
            </p>
          </div>
        ) : (
          <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
            <p style={{ color: "var(--success)", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.25rem" }}>
              ✨ Time Capsule Unlocked!
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
              Your message and ETH are ready to claim.
            </p>
          </div>
        )}

        {/* Claim Button */}
        {isLocked ? (
          <button
            disabled
            style={{
              width: "100%",
              padding: "1rem",
              borderRadius: "10px",
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "not-allowed",
            }}
          >
            Locked — Not Yet Available
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
            {claiming ? "Claiming..." : `Claim ${ethAmount} ETH + Reveal Message`}
          </button>
        )}

        <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginTop: "1.5rem" }}>
          Capsule ID #{id} · {capsule?.founder?.toLowerCase() === walletAddress?.toLowerCase() ? "You are the founder" : "You are the beneficiary"}
        </p>
      </div>
    </div>
  );
}
