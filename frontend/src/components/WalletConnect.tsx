import { useState } from "react";
import { ethers } from "ethers";

interface WalletConnectProps {
  onConnected: (signer: ethers.JsonRpcSigner, address: string) => void;
}

export default function WalletConnect({ onConnected }: WalletConnectProps) {
  const [loading, setLoading] = useState(false);

  async function connect() {
    if (!window.ethereum) {
      alert("MetaMask is not installed. Please install it from https://metamask.io");
      return;
    }
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      onConnected(signer, address);
    } catch (err: any) {
      alert(err.message || "Failed to connect wallet");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={connect}
      disabled={loading}
      style={{
        background: "var(--accent)",
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        padding: "0.75rem 1.5rem",
        fontSize: "1rem",
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? "Connecting..." : "Connect MetaMask"}
    </button>
  );
}

// Extend Window type for TypeScript
declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (...args: any[]) => void) => void;
      removeListener: (event: string, callback: (...args: any[]) => void) => void;
    };
  }
}
