import { useState } from "react";
import { ethers } from "ethers";
import { useToast } from "./Toast";
import { parseContractError } from "../lib/errors";

interface WalletConnectProps {
  onConnected: (signer: ethers.JsonRpcSigner, address: string) => void;
}

export default function WalletConnect({ onConnected }: WalletConnectProps) {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  async function connect() {
    if (!window.ethereum) {
      showToast("error", "MetaMask is not installed. Please install it from https://metamask.io");
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
      showToast("error", parseContractError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className="btn btn-primary"
      onClick={connect}
      disabled={loading}
    >
      {loading ? (
        <>
          <span className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} />
          Connecting...
        </>
      ) : (
        "Connect MetaMask"
      )}
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
