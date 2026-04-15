import { ethers } from "ethers";
import type { CapsuleView } from "../hooks/useTimeCapsule";
import CountdownTimer from "./CountdownTimer";

interface CapsuleCardProps {
  capsule?: CapsuleView;
  compact?: boolean;
  loading?: boolean;
}

export default function CapsuleCard({ capsule, compact = false, loading = false }: CapsuleCardProps) {
  const depositedEth = capsule ? ethers.formatEther(capsule.depositedValue) : "0";
  const unlocked = capsule ? Number(capsule.unlockTimestamp) * 1000 <= Date.now() : false;

  if (loading) {
    return (
      <div className="card">
        <style>{`
          @keyframes skeleton-pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.6; }
          }
          .skeleton-line {
            animation: skeleton-pulse 1.4s ease-in-out infinite;
            background: var(--border);
            border-radius: 2px;
          }
        `}</style>
        {compact ? (
          <div className="flex justify-between items-center">
            <div className="skeleton-line" style={{ height: "1rem", width: "5rem" }} />
            <div className="skeleton-line" style={{ height: "0.85rem", width: "4rem" }} />
          </div>
        ) : (
          <>
            <div className="flex justify-between mb-2">
              <div className="skeleton-line" style={{ height: "1.75rem", width: "6rem" }} />
              <div className="skeleton-line" style={{ height: "1.5rem", width: "4.5rem", borderRadius: "2px" }} />
            </div>
            <div className="grid-info">
              <div>
                <div className="skeleton-line" style={{ height: "0.7rem", width: "3rem", marginBottom: "0.4rem" }} />
                <div className="skeleton-line" style={{ height: "1rem", width: "5rem" }} />
              </div>
              <div>
                <div className="skeleton-line" style={{ height: "0.7rem", width: "4rem", marginBottom: "0.4rem" }} />
                <div className="skeleton-line" style={{ height: "1rem", width: "2rem" }} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div className="skeleton-line" style={{ height: "0.7rem", width: "3rem", marginBottom: "0.4rem" }} />
                <div className="skeleton-line" style={{ height: "0.9rem", width: "10rem" }} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div className="skeleton-line" style={{ height: "0.7rem", width: "3.5rem", marginBottom: "0.4rem" }} />
                <div className="skeleton-line" style={{ height: "0.85rem", width: "8rem" }} />
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="card" style={{ padding: "1rem" }}>
        <div className="flex justify-between items-center">
          <span className="font-bold">{depositedEth} ETH</span>
          <span className={`text-sm ${unlocked ? "text-success" : "text-accent"}`}>
            {capsule ? <CountdownTimer unlockTimestamp={capsule.unlockTimestamp} /> : "N/A"}
          </span>
        </div>
      </div>
    );
  }

  if (!capsule) {
    return (
      <div className="card text-center" style={{ padding: "2rem", color: "var(--text-muted)" }}>
        No capsule data
      </div>
    );
  }

  const statusBg =
    capsule.isWithdrawn
      ? "var(--danger-dim)"
      : unlocked
      ? "var(--success-dim)"
      : "var(--accent-subtle)";

  const statusColor =
    capsule.isWithdrawn
      ? "var(--danger)"
      : unlocked
      ? "var(--success)"
      : "var(--accent)";

  const statusBorder =
    capsule.isWithdrawn
      ? "rgba(255,77,77,0.25)"
      : unlocked
      ? "rgba(57,255,143,0.25)"
      : "rgba(255,107,0,0.25)";

  const statusLabel = capsule.isWithdrawn ? "Withdrawn" : unlocked ? "Claimable" : "Locked";

  return (
    <div className="card">
      <div className="flex justify-between items-start mb-2">
        <span style={{ fontSize: "1.5rem", fontWeight: 700 }}>{depositedEth} ETH</span>
        <span
          className="capsule-status"
          style={{
            background: statusBg,
            color: statusColor,
            border: `1px solid ${statusBorder}`,
          }}
        >
          {statusLabel}
        </span>
      </div>

      <div className="grid-info">
        <div>
          <div className="info-label">Status</div>
          <CountdownTimer unlockTimestamp={capsule.unlockTimestamp} />
        </div>
        <div>
          <div className="info-label">Beneficiaries</div>
          <div className="font-bold">{capsule.beneficiaryCount}</div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <div className="info-label">Founder</div>
          <div className="font-mono text-sm" style={{ wordBreak: "break-all" }}>
            {capsule.founder}
          </div>
        </div>
        {capsule.messageHash && (
          <div style={{ gridColumn: "1 / -1" }}>
            <div className="info-label">Message</div>
            <div className="font-mono text-sm" style={{ wordBreak: "break-all" }}>
              {capsule.messageHash}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
