import { ethers } from "ethers";
import type { CapsuleView } from "../hooks/useTimeCapsule";

interface CapsuleCardProps {
  capsule: CapsuleView;
  compact?: boolean;
}

function formatTime(seconds: bigint): string {
  const s = Number(seconds);
  if (s <= 0) return "Unlocked";
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

export default function CapsuleCard({ capsule, compact = false }: CapsuleCardProps) {
  const depositedEth = ethers.formatEther(capsule.depositedValue);
  const isUnlocked = capsule.isUnlocked;

  if (compact) {
    return (
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "1rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600 }}>{depositedEth} ETH</span>
          <span
            style={{
              fontSize: "0.8rem",
              color: isUnlocked ? "var(--success)" : "var(--accent-light)",
            }}
          >
            {isUnlocked ? "Unlocked" : formatTime(capsule.timeRemaining)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "1.5rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <span style={{ fontSize: "1.5rem", fontWeight: 700 }}>{depositedEth} ETH</span>
        <span
          style={{
            background: capsule.isWithdrawn
              ? "rgba(239, 68, 68, 0.2)"
              : isUnlocked
              ? "rgba(34, 197, 94, 0.2)"
              : "rgba(124, 58, 237, 0.2)",
            color: capsule.isWithdrawn
              ? "#ef4444"
              : isUnlocked
              ? "var(--success)"
              : "var(--accent-light)",
            padding: "0.25rem 0.75rem",
            borderRadius: "999px",
            fontSize: "0.85rem",
            fontWeight: 600,
          }}
        >
          {capsule.isWithdrawn
            ? "Withdrawn"
            : isUnlocked
            ? "Claimable"
            : "Locked"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: "0.9rem" }}>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Status</span>
          <div>{isUnlocked ? "Unlocked" : formatTime(capsule.timeRemaining)}</div>
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Beneficiaries</span>
          <div>{capsule.beneficiaryCount}</div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <span style={{ color: "var(--text-muted)" }}>Founder</span>
          <div style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
            {capsule.founder}
          </div>
        </div>
        {capsule.messageHash && (
          <div style={{ gridColumn: "1 / -1" }}>
            <span style={{ color: "var(--text-muted)" }}>Message</span>
            <div style={{ fontFamily: "monospace", fontSize: "0.8rem", wordBreak: "break-all" }}>
              {capsule.messageHash}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
