import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Link } from "react-router-dom";
import { getVaultContract, VAULT_ABI, CONTRACT_ADDRESS } from "../lib/contracts";
import WalletConnect from "../components/WalletConnect";

type EventType = "all" | "created" | "claimed" | "cancelled";

interface EventInfo {
  type: EventType;
  capsuleId: number;
  founder: string;
  beneficiary: string;
  amount: string;
  timestamp: Date;
  txHash: string;
  blockNumber: number;
  unlockTimestamp?: Date;
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatTimestamp(ts: Date): string {
  return ts.toLocaleString();
}

function formatUnlockDate(ts: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`;
}

function getExplorerUrl(txHash: string, chainId: number): string {
  if (chainId === 137) return `https://polygonscan.com/tx/${txHash}`;
  if (chainId === 80001) return `https://mumbai.polygonscan.com/tx/${txHash}`;
  if (chainId === 31337) return "#";
  return `https://polygonscan.com/tx/${txHash}`;
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  all: "Event",
  created: "Created",
  claimed: "Claimed",
  cancelled: "Cancelled",
};

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  all: "var(--text)",
  created: "var(--accent)",
  claimed: "var(--success)",
  cancelled: "var(--danger)",
};

function EventRow({ event, chainId }: { event: EventInfo; chainId: number }) {
  return (
    <div className="event-row">
      <span
        className="event-type-badge"
        style={{ color: EVENT_TYPE_COLORS[event.type], borderLeftColor: EVENT_TYPE_COLORS[event.type] }}
      >
        {EVENT_TYPE_LABELS[event.type]}
      </span>
      <div>
        <span className="text-muted text-xs">Founder: </span>
        <span className="font-mono text-sm">{formatAddress(event.founder)}</span>
      </div>
      <div>
        <span className="text-muted text-xs">Beneficiary: </span>
        <span className="font-mono text-sm">{formatAddress(event.beneficiary)}</span>
      </div>
      <div style={{ textAlign: "center" }}>
        <span className="font-bold text-sm">#{event.capsuleId}</span>
      </div>
      <div className="event-details">
        {event.unlockTimestamp && (
          <span className="text-accent text-xs font-mono">
            Until: {formatUnlockDate(event.unlockTimestamp)}
          </span>
        )}
        <span className="text-muted text-xs">
          {formatTimestamp(event.timestamp)}
        </span>
        {chainId !== 31337 ? (
          <a
            href={getExplorerUrl(event.txHash, chainId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent text-xs font-mono"
          >
            {formatAddress(event.txHash)}
          </a>
        ) : (
          <span className="text-muted text-xs font-mono">
            {formatAddress(event.txHash)}
          </span>
        )}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="event-row">
      <div className="skeleton" style={{ height: "20px", width: "70px" }} />
      <div className="skeleton" style={{ height: "20px", flex: 1 }} />
      <div className="skeleton" style={{ height: "20px", flex: 1 }} />
      <div className="skeleton" style={{ height: "20px", width: "60px" }} />
      <div className="skeleton" style={{ height: "20px", width: "100px" }} />
    </div>
  );
}

export default function History() {
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<EventType>("all");
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number>(137);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletFilter, setWalletFilter] = useState("");
  const [walletFilterInput, setWalletFilterInput] = useState("");

  const PAGE_SIZE = 200;

  const fetchEvents = useCallback(
    async (fromBlock: number, toBlock: number, append = false) => {
      if (!provider) return;
      try {
        const contract = getVaultContract(provider) as ethers.Contract;
        const logs = await contract.queryFilter("*", fromBlock, toBlock);
        const newEvents: EventInfo[] = [];

        for (const log of logs) {
          const eventLog = log as ethers.EventLog;
          const args = eventLog.args;
          if (!args) continue;
          const eventName = eventLog.fragment.name;
          let type: EventType | null = null;
          let founder = "";
          let beneficiary = "";
          let amount = "";
          let unlockTimestamp: Date | undefined;

          // Event parsing — topics[1] and topics[2] hold indexed params (capped at 32 bytes)
          // CapsuleCreated: topics[1]=capsuleId, topics[2]=founder, topics[3]=primaryBeneficiary
          // WithdrawalClaimed: topics[1]=capsuleId, topics[2]=beneficiary
          // CapsuleCancelled: topics[1]=capsuleId, topics[2]=founder
          if (eventName === "CapsuleCreated") {
            type = "created";
            // topics[2] = indexed founder address (20 bytes, right-padded to 32)
            founder = eventLog.topics[2] ? ethers.getAddress("0x" + eventLog.topics[2].slice(-40)) : "";
            // args[2] = non-indexed originalUnlockTime (unix timestamp)
            if (args[2] != null) {
              const unlockBn = typeof args[2] === "bigint" ? args[2] : BigInt(args[2].toString());
              unlockTimestamp = new Date(Number(unlockBn) * 1000);
            }
            amount = "";
          } else if (eventName === "WithdrawalClaimed") {
            type = "claimed";
            // topics[2] = indexed beneficiary address
            beneficiary = eventLog.topics[2] ? ethers.getAddress("0x" + eventLog.topics[2].slice(-40)) : "";
            // args[0] = non-indexed claimed amount (wei)
            if (args[0] != null) {
              const valBn = typeof args[0] === "bigint" ? args[0] : BigInt(args[0].toString());
              if (valBn > 0n) amount = ethers.formatEther(valBn);
            }
          } else if (eventName === "CapsuleCancelled") {
            type = "cancelled";
            // topics[2] = indexed founder address
            founder = eventLog.topics[2] ? ethers.getAddress("0x" + eventLog.topics[2].slice(-40)) : "";
            amount = "";
          } else {
            continue;
          }

          // topics[1] = indexed capsuleId (uint256, 32 bytes)
          const capsuleId = eventLog.topics[1] ? Number(BigInt(eventLog.topics[1])) : 0;
          const block = await log.getBlock();
          const timestamp = new Date((block?.timestamp || 0) * 1000);

          newEvents.push({ type, capsuleId, founder, beneficiary, amount, timestamp, txHash: log.transactionHash, blockNumber: log.blockNumber, unlockTimestamp });
        }

        newEvents.sort((a, b) => b.blockNumber - a.blockNumber);

        if (append) {
          setEvents((prev) => {
            const existingIds = new Set(prev.map((e) => `${e.txHash}-${e.blockNumber}`));
            const uniqueNew = newEvents.filter((e) => !existingIds.has(`${e.txHash}-${e.blockNumber}`));
            return [...prev, ...uniqueNew];
          });
        } else {
          setEvents(newEvents);
        }
        setHasMore(newEvents.length >= PAGE_SIZE);
      } catch (err: any) {
        console.error("Error fetching events:", err);
        setError(err.message || "Failed to fetch events");
      }
    },
    [provider]
  );

  async function handleConnected(signer: ethers.JsonRpcSigner, address: string) {
    setWalletAddress(address);
    const browserProvider = signer.provider as ethers.BrowserProvider;
    if (browserProvider) {
      setProvider(browserProvider);
      try {
        const network = await browserProvider.getNetwork();
        setChainId(Number(network.chainId));
      } catch (err) {
        console.warn("Failed to detect network:", err);
      }
    }
  }

  useEffect(() => {
    async function initProvider() {
      if (!window.ethereum) {
        setError("MetaMask is not installed");
        setLoading(false);
        return;
      }
      try {
        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        const network = await browserProvider.getNetwork();
        setChainId(Number(network.chainId));
        setProvider(browserProvider);
        const signer = await browserProvider.getSigner();
        const address = await signer.getAddress();
        setWalletAddress(address);
        // Auto-filter to connected wallet
        setWalletFilter(address);
        setWalletFilterInput(address);
        const latestBlock = await browserProvider.getBlockNumber();
        const fromBlock = 0; // query from genesis — local Hardhat has no blocks before deploy
        await fetchEvents(fromBlock, latestBlock);
        setLoading(false);
      } catch (err: any) {
        console.error("Error initializing provider:", err);
        setError(err.message || "Failed to connect to network");
        setLoading(false);
      }
    }
    initProvider();
  }, [fetchEvents]);

  const loadMore = async () => {
    if (!provider || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const oldestEvent = events[events.length - 1];
      if (!oldestEvent) { setLoadingMore(false); return; }
      const latestBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, oldestEvent.blockNumber - PAGE_SIZE);
      await fetchEvents(fromBlock, oldestEvent.blockNumber - 1, true);
    } catch (err: any) {
      console.error("Error loading more:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredEvents = events.filter((e) => {
    if (filter !== "all" && e.type !== filter) return false;
    if (walletFilter) {
      const addr = walletFilter.toLowerCase();
      if (e.founder.toLowerCase() !== addr && e.beneficiary.toLowerCase() !== addr) return false;
    }
    return true;
  });

  const networkLabel = chainId === 137 ? "Polygon Mainnet" : chainId === 80001 ? "Mumbai Testnet" : `Chain ID: ${chainId}`;

  if (!walletAddress) {
    return (
      <div className="page-container" style={{ textAlign: "center", paddingTop: "4rem", paddingBottom: "4rem" }}>
        <h2 style={{ marginBottom: "2rem" }}>Transaction History</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
          Connect your wallet to view your transaction history.
        </p>
        <WalletConnect onConnected={handleConnected} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>Transaction History</h2>
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted font-mono">
            {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
          </span>
          <Link to="/create" className="link-arrow">Create Capsule →</Link>
        </div>
      </div>

      {/* Network indicator */}
      <div className="flex items-center gap-1 mb-2 text-xs">
        <span className="text-muted">Network:</span>
        <span
          className={chainId === 137 ? "text-success" : "text-accent"}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {networkLabel}
        </span>
        <span className="text-muted">| Contract:</span>
        <span className="font-mono text-accent">{formatAddress(CONTRACT_ADDRESS)}</span>
      </div>

      {/* Filter tabs + wallet filter */}
      <div
        className="flex gap-1 mb-2 filter-tabs"
        style={{
          borderBottom: "1px solid var(--border)",
          paddingBottom: "0.5rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {(["all", "created", "claimed", "cancelled"] as EventType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-ghost"}`}
            style={{ textTransform: "capitalize", padding: "0.4rem 0.85rem" }}
          >
            {f}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Wallet filter — hidden, always auto-filtered to connected wallet */}
        <div className="flex gap-1 items-center wallet-filter-wrapper">
          <span className="text-muted text-xs">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Header row */}
      <div
        className="events-header-row"
        style={{
          display: "grid",
          gridTemplateColumns: "90px 1fr 1fr 80px 110px",
          gap: "1rem",
          padding: "0.5rem 1rem",
          fontSize: "0.7rem",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span>Type</span>
        <span>Founder</span>
        <span>Beneficiary</span>
        <span style={{ textAlign: "center" }}>Capsule</span>
        <span style={{ textAlign: "right" }}>Details</span>
      </div>

      {/* Events list */}
      <div className="events-table-wrapper">
        {loading ? (
          <>
            <SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow />
          </>
        ) : error ? (
          <div className="card text-center" style={{ padding: "2rem" }}>
            <p className="text-danger">{error}</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="card text-center" style={{ padding: "3rem 2rem" }}>
            <p>No events found for your wallet.</p>
            <p className="text-muted text-sm mt-1">
              Your capsules and claims will appear here once they are created or claimed on the blockchain.
            </p>
          </div>
        ) : (
          <>
            {filteredEvents.map((event, idx) => (
              <EventRow key={`${event.txHash}-${event.blockNumber}-${idx}`} event={event} chainId={chainId} />
            ))}
            {hasMore && (
              <div style={{ padding: "1.5rem", textAlign: "center" }}>
                <button
                  className="btn btn-ghost"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
