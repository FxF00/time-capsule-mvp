import { useState, useEffect } from "react";

interface CountdownTimerProps {
  unlockTimestamp: bigint; // Unix seconds
  onExpire?: () => void;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function getTimeRemaining(unlockTs: bigint): { days: number; hours: number; minutes: number; seconds: number; expired: boolean } {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now >= unlockTs) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }
  const diff = Number(unlockTs - now);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  return { days, hours, minutes, seconds, expired: false };
}

export default function CountdownTimer({ unlockTimestamp, onExpire }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => getTimeRemaining(unlockTimestamp));

  useEffect(() => {
    const interval = setInterval(() => {
      const r = getTimeRemaining(unlockTimestamp);
      setRemaining(r);
      if (r.expired) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [unlockTimestamp, onExpire]);

  if (remaining.expired) {
    return (
      <div style={{ fontSize: "1.5rem", color: "var(--success)", fontWeight: 700 }}>
        Unlocked!
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "monospace", fontSize: "1.8rem", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.05em" }}>
      {remaining.days > 0 && (
        <span>{remaining.days}d{" "}</span>
      )}
      <span>{pad(remaining.hours)}h{" "}</span>
      <span>{pad(remaining.minutes)}m{" "}</span>
      <span>{pad(remaining.seconds)}s</span>
    </div>
  );
}
