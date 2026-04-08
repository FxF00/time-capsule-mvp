import { createContext, useContext, useState, ReactNode } from "react";
import { ethers } from "ethers";

export type NetworkStatus = "mainnet" | "testnet" | "localhost" | "unknown";

interface NetworkInfo {
  name: string;
  status: NetworkStatus;
  chainId: number | null;
}

interface NetworkContextValue {
  network: NetworkInfo;
  setNetwork: (network: NetworkInfo) => void;
  provider: ethers.BrowserProvider | null;
  setProvider: (provider: ethers.BrowserProvider | null) => void;
}

const NetworkContext = createContext<NetworkContextValue>({
  network: { name: "Unknown Network", status: "unknown", chainId: null },
  setNetwork: () => {},
  provider: null,
  setProvider: () => {},
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<NetworkInfo>({
    name: "Unknown Network",
    status: "unknown",
    chainId: null,
  });
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);

  return (
    <NetworkContext.Provider value={{ network, setNetwork, provider, setProvider }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}

export function getNetworkInfo(network: { name?: string; chainId?: bigint } & Record<string, any>): NetworkInfo {
  const chainId = network.chainId ? Number(network.chainId) : null;

  // Known chain IDs
  // Polygon mainnet: 137
  // Polygon Amoy (testnet): 80002
  // Hardhat localhost: 31337
  if (chainId === 137) {
    return { name: "Polygon", status: "mainnet", chainId };
  } else if (chainId === 80002) {
    return { name: "Polygon Amoy", status: "testnet", chainId };
  } else if (chainId === 31337) {
    return { name: "Hardhat Localhost", status: "localhost", chainId };
  } else if (chainId === 1) {
    return { name: "Ethereum Mainnet", status: "mainnet", chainId };
  } else if (chainId === 11155111) {
    return { name: "Sepolia", status: "testnet", chainId };
  } else if (chainId === 80001) {
    return { name: "Mumbai", status: "testnet", chainId };
  }

  // Try to use the network name if available
  const name = network.name || "Unknown Network";
  if (name.toLowerCase().includes("localhost")) {
    return { name, status: "localhost", chainId };
  }
  if (name.toLowerCase().includes("mainnet") || name.toLowerCase().includes("polygon")) {
    return { name, status: "mainnet", chainId };
  }

  return { name: name || "Unknown Network", status: "unknown", chainId };
}
