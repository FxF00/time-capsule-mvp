import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useParams, Link } from "react-router-dom";
import WalletConnect from "../components/WalletConnect";
import CountdownTimer from "../components/CountdownTimer";
import { useTimeCapsule } from "../hooks/useTimeCapsule";
import type { CapsuleView } from "../hooks/useTimeCapsule";

type PageState = "loading" | "no_wallet" | "wrong_wallet" | "locked" | "unlocked" | "claimed" | "not_found";

export default function ReceiveCapsule() {
  const { founder, capsuleId } = useParams();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [capsule, setCapsule] = useState<CapsuleView | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState<bigint | null>(null);

  const { getCapsule, claimCapsule } = useTimeCapsule();

  // Parse capsule ID from URL
  const id = Number(capsuleId);

  // Validate founder address
  const isValidFounder = founder && ethers.isAddress(founder);

  // Keep block timestamp in sync for accurate CountdownTimer
  useEffect(() => {
    async function fetchBlockTimestamp() {
      try {
        const ethereum = window.ethereum as ethers.Eip1193Provider | undefined;
        if (!ethereum) return;
        const provider = new ethers.BrowserProvider(ethereum);
        const block = await provider.getBlock('latest');
        if (block) setCurrentTimestamp(BigInt(Number(block.timestamp)));
      } catch { /* ignore — CountdownTimer falls back to Date.now() */ }
    }
    fetchBlockTimestamp();
    const interval = setInterval(fetchBlockTimestamp, 12000); // refresh every 12s
    return () => clearInterval(interval);
  }, []);

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

  function handleCountdownExpire() {
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

  if (pageState === "loading") {
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

  if (pageState === "no_wallet") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: "2rem" }}>
        <div style={{ maxWidth: "480px", textAlign: "center" }}>
          <div style={{ fontSize: "4rem", marginBottom: "1.5rem" }}>📦</div>
          <h2 style={{ marginBottom: "0.75rem", fontSize: "1.5rem", fontWeight: 700, letterSpacing: "0.05em" }}>INCOMING TIME CAPSULE</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginBottom: "2rem" }}>
            Connect your wallet to reveal the capsule contents.
          </p>
          <WalletConnect onConnected={handleConnected} />
        </div>
      </div>
    );
  }

  if (pageState === "wrong_wallet") {
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
          <Link
            to="/create"
            style={{ color: "var(--accent-light)", marginTop: "2rem", display: "inline-block", fontSize: "0.9rem" }}
          >
            Create Your Own Capsule
          </Link>
        </div>
      </div>
    );
  }

  if (pageState === "not_found") {
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

  if (pageState === "claimed") {
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

  // States: locked | unlocked
  const ethAmount = capsule ? ethers.formatEther(capsule.depositedValue) : "0";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: "2rem" }}>
      <div style={{ maxWidth: "480px", width: "100%", textAlign: "center" }}>

        {/* Capsule icon */}
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>
          {pageState === "locked" ? "📦" : "🔓"}
        </div>

        {/* Status label */}
        <p style={{
          color: pageState === "locked" ? "var(--text-muted)" : "var(--success)",
          fontSize: "0.85rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          marginBottom: "1.5rem",
        }}>
          {pageState === "locked" ? "⏳ INCOMING TIME CAPSULE" : "🔓 TIME CAPSULE UNLOCKED"}
        </p>

        {/* ETH Amount */}
        <div style={{ fontSize: "3rem", fontWeight: 700, color: "var(--accent)", marginBottom: "0.5rem" }}>
          {ethAmount} ETH
        </div>

        {/* Divider */}
        <div style={{ width: "60px", height: "1px", background: "var(--border)", margin: "1.5rem auto" }} />

        {/* Countdown timer */}
        {pageState === "locked" && capsule && (
          <div style={{ marginBottom: "2rem" }}>
            <CountdownTimer
              unlockTimestamp={capsule.unlockTimestamp}
              currentTimestamp={currentTimestamp ?? undefined}
              compact
            />
          </div>
        )}

        {/* Button */}
        {pageState === "locked" ? (
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
          #{id} · {capsule?.beneficiaryCount ?? 0} beneficiary{capsule?.beneficiaryCount !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}
