import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Link } from "react-router-dom";
import { getVaultContract, VAULT_ABI, CONTRACT_ADDRESS } from "../lib/contracts";

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
  // Polygon mainnet
  if (chainId === 137) {
    return `https://polygonscan.com/tx/${txHash}`;
  }
  // Polygon Mumbai testnet
  if (chainId === 80001) {
    return `https://mumbai.polygonscan.com/tx/${txHash}`;
  }
  // Default to Polygonscan for other networks (including localhost)
  return `https://polygonscan.com/tx/${txHash}`;
}

function SkeletonRow() {
  return (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        padding: "1rem",
        borderBottom: "1px solid var(--border)",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "80px",
          height: "24px",
          background: "var(--card)",
          borderRadius: "4px",
          animation: "pulse 1.5s infinite",
        }}
      />
      <div
        style={{
          flex: 1,
          height: "24px",
          background: "var(--card)",
          borderRadius: "4px",
          animation: "pulse 1.5s infinite",
        }}
      />
      <div
        style={{
          width: "100px",
          height: "24px",
          background: "var(--card)",
          borderRadius: "4px",
          animation: "pulse 1.5s infinite",
        }}
      />
      <div
        style={{
          width: "120px",
          height: "24px",
          background: "var(--card)",
          borderRadius: "4px",
          animation: "pulse 1.5s infinite",
        }}
      />
    </div>
  );
}

function EventRow({ event, chainId }: { event: EventInfo; chainId: number }) {
  const eventColors: Record<EventType, string> = {
    all: "var(--text)",
    created: "var(--accent-light)",
    claimed: "var(--success)",
    cancelled: "var(--danger)",
  };

  const eventLabels: Record<EventType, string> = {
    all: "Event",
    created: "Created",
    claimed: "Claimed",
    cancelled: "Cancelled",
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr 1fr 100px 120px",
        gap: "1rem",
        padding: "1rem",
        borderBottom: "1px solid var(--border)",
        alignItems: "center",
        fontSize: "0.9rem",
      }}
    >
      <span
        style={{
          color: eventColors[event.type],
          fontWeight: 600,
          fontSize: "0.85rem",
        }}
      >
        {eventLabels[event.type]}
      </span>
      <div>
        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Founder: </span>
        <span style={{ fontFamily: "monospace" }}>{formatAddress(event.founder)}</span>
      </div>
      <div>
        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Beneficiary: </span>
        <span style={{ fontFamily: "monospace" }}>{formatAddress(event.beneficiary)}</span>
      </div>
      <div style={{ textAlign: "center" }}>
        <span style={{ fontWeight: 600 }}>#{event.capsuleId}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "flex-end" }}>
        {event.amount && (
          <span style={{ color: "var(--success)", fontWeight: 600 }}>
            {event.amount} ETH
          </span>
        )}
        {event.unlockTimestamp && (
          <span style={{ color: "var(--accent)", fontSize: "0.7rem" }}>
            Unlocks: {formatUnlockDate(event.unlockTimestamp)}
          </span>
        )}
        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
          {formatTimestamp(event.timestamp)}
        </span>
        <a
          href={getExplorerUrl(event.txHash, chainId)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--accent-light)",
            fontSize: "0.75rem",
            fontFamily: "monospace",
          }}
        >
          {formatAddress(event.txHash)}
        </a>
      </div>
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
  const [chainId, setChainId] = useState<number>(137); // Default to Polygon
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);

  const PAGE_SIZE = 50;

  const fetchEvents = useCallback(
    async (fromBlock: number, toBlock: number, append = false) => {
      if (!provider) return;

      try {
        const contract = getVaultContract(provider) as ethers.Contract;
        const logs = await contract.queryFilter("*", fromBlock, toBlock);

        const newEvents: EventInfo[] = [];

        for (const log of logs) {
          // queryFilter returns (Log | EventLog)[], only EventLog has args and fragment
          const eventLog = log as ethers.EventLog;
          const args = eventLog.args;
          if (!args) continue;

          const eventName = eventLog.fragment.name;

          let type: EventType | null = null;
          let founder = "";
          let beneficiary = "";
          let amount = "";
          let unlockTimestamp: Date | undefined;

          if (eventName === "CapsuleCreated") {
            type = "created";
            // topics[1] = capsuleId (indexed), topics[2] = founder (indexed, address)
            // args[0] = unlockTimestamp (uint256), args[1] = value (uint256 in wei), args[2] = messageHash (string)
            founder = eventLog.topics[2] ? ethers.getAddress("0x" + eventLog.topics[2].slice(-20)) : "";
            // Extract value from args[1] — handle BigInt safely
            if (args[1] != null) {
              const valBn = typeof args[1] === "bigint" ? args[1] : BigInt(args[1].toString());
              amount = ethers.formatEther(valBn);
            }
            // Extract unlockTimestamp from args[0] — handle BigInt safely
            if (args[0] != null) {
              const unlockBn = typeof args[0] === "bigint" ? args[0] : BigInt(args[0].toString());
              unlockTimestamp = new Date(Number(unlockBn) * 1000);
            }
          } else if (eventName === "WithdrawalClaimed") {
            type = "claimed";
            // topics[1] = capsuleId (indexed), topics[2] = beneficiary (indexed)
            // args[0] = amount (uint256 in wei)
            beneficiary = eventLog.topics[2] ? ethers.getAddress("0x" + eventLog.topics[2].slice(-20)) : "";
            if (args[0] != null) {
              const valBn = typeof args[0] === "bigint" ? args[0] : BigInt(args[0].toString());
              amount = ethers.formatEther(valBn);
            }
          } else if (eventName === "CapsuleCancelled") {
            type = "cancelled";
            // topics[1] = capsuleId (indexed), topics[2] = founder (indexed)
            founder = eventLog.topics[2] ? ethers.getAddress("0x" + eventLog.topics[2].slice(-20)) : "";
          } else if (eventName === "BeneficiaryAdded") {
            continue;
          }

          if (type === null) continue;

          const capsuleId = eventLog.topics[1] ? Number(BigInt(eventLog.topics[1])) : 0;
          const block = await log.getBlock();
          const timestamp = new Date((block?.timestamp || 0) * 1000);

          newEvents.push({
            type,
            capsuleId,
            founder,
            beneficiary,
            amount,
            timestamp,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            unlockTimestamp,
          });
        }

        // Sort by block number descending (newest first)
        newEvents.sort((a, b) => b.blockNumber - a.blockNumber);

        if (append) {
          setEvents((prev) => {
            const existingIds = new Set(prev.map((e) => `${e.txHash}-${e.blockNumber}`));
            const uniqueNew = newEvents.filter(
              (e) => !existingIds.has(`${e.txHash}-${e.blockNumber}`)
            );
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

        // Fetch initial events (last PAGE_SIZE)
        const latestBlock = await browserProvider.getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - PAGE_SIZE);
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
      if (!oldestEvent) {
        setLoadingMore(false);
        return;
      }

      const latestBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, oldestEvent.blockNumber - PAGE_SIZE);
      await fetchEvents(fromBlock, oldestEvent.blockNumber - 1, true);
    } catch (err: any) {
      console.error("Error loading more:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredEvents =
    filter === "all" ? events : events.filter((e) => e.type === filter);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h2>Transaction History</h2>
        <Link to="/create" style={{ color: "var(--accent-light)", fontSize: "0.9rem" }}>
          Create Capsule
        </Link>
      </div>

      {/* Network indicator */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
          }}
        >
          Network:{" "}
        </span>
        <span
          style={{
            fontSize: "0.75rem",
            fontFamily: "monospace",
            color: chainId === 137 ? "var(--success)" : "var(--accent-light)",
          }}
        >
          {chainId === 137 ? "Polygon Mainnet" : chainId === 80001 ? "Mumbai Testnet" : `Chain ID: ${chainId}`}
        </span>
        <span
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
          }}
        >
          | Contract:{" "}
        </span>
        <span
          style={{
            fontSize: "0.75rem",
            fontFamily: "monospace",
            color: "var(--accent-light)",
          }}
        >
          {formatAddress(CONTRACT_ADDRESS)}
        </span>
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.5rem",
          borderBottom: "1px solid var(--border)",
          paddingBottom: "0.5rem",
        }}
      >
        {(["all", "created", "claimed", "cancelled"] as EventType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: "transparent",
              color: filter === f ? "var(--accent)" : "var(--text-muted)",
              border: "none",
              borderRadius: "6px",
              padding: "0.5rem 1rem",
              fontSize: "0.9rem",
              fontWeight: filter === f ? 600 : 400,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "100px 1fr 1fr 100px 120px",
          gap: "1rem",
          padding: "0.75rem 1rem",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        <span>Type</span>
        <span>Founder</span>
        <span>Beneficiary</span>
        <span style={{ textAlign: "center" }}>Capsule</span>
        <span style={{ textAlign: "right" }}>Details</span>
      </div>

      {/* Events list */}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : error ? (
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div
            style={{
              padding: "3rem 2rem",
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <p>No events found.</p>
            <p style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
              Events will appear here once capsules are created on the blockchain.
            </p>
          </div>
        ) : (
          <>
            {filteredEvents.map((event, idx) => (
              <EventRow key={`${event.txHash}-${event.blockNumber}-${idx}`} event={event} chainId={chainId} />
            ))}

            {/* Load more button */}
            {hasMore && (
              <div style={{ padding: "1.5rem", textAlign: "center" }}>
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{
                    background: "transparent",
                    color: "var(--accent-light)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "0.75rem 1.5rem",
                    fontSize: "0.9rem",
                    cursor: loadingMore ? "not-allowed" : "pointer",
                    opacity: loadingMore ? 0.7 : 1,
                  }}
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
