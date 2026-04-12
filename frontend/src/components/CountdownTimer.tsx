import { useState, useEffect } from "react";

interface CountdownTimerProps {
  unlockTimestamp: bigint; // Unix seconds
  onExpire?: () => void;
  /** Current block timestamp in seconds. Falls back to Date.now() if not provided. */
  currentTimestamp?: bigint;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function getTimeRemaining(unlockTs: bigint, currentTs: bigint): { days: number; hours: number; minutes: number; seconds: number; expired: boolean } {
  if (currentTs >= unlockTs) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }
  const diff = Number(unlockTs - currentTs);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  return { days, hours, minutes, seconds, expired: false };
}

export default function CountdownTimer({ unlockTimestamp, onExpire, currentTimestamp }: CountdownTimerProps) {
  const now = currentTimestamp ?? BigInt(Math.floor(Date.now() / 1000));
  const [remaining, setRemaining] = useState(() => getTimeRemaining(unlockTimestamp, now));

  useEffect(() => {
    const nowVal = currentTimestamp ?? BigInt(Math.floor(Date.now() / 1000));
    const r = getTimeRemaining(unlockTimestamp, nowVal);
    setRemaining(r);
    if (r.expired) return;

    const interval = setInterval(() => {
      const nowFresh = currentTimestamp ?? BigInt(Math.floor(Date.now() / 1000));
      const r2 = getTimeRemaining(unlockTimestamp, nowFresh);
      setRemaining(r2);
      if (r2.expired) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [unlockTimestamp, onExpire, currentTimestamp]);

  if (remaining.expired) {
    return (
      <div style={{ fontSize: "1.5rem", color: "var(--success)", fontWeight: 700 }}>
        Unlocked!
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontFamily: "monospace", fontSize: "1.8rem", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.05em" }}>
        {remaining.days > 0 && (
          <span>{remaining.days}d{" "}</span>
        )}
        <span>{pad(remaining.hours)}h{" "}</span>
        <span>{pad(remaining.minutes)}m{" "}</span>
        <span>{pad(remaining.seconds)}s</span>
      </div>
      {/* Current time reference */}
      <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "0.4rem", fontFamily: "monospace" }}>
        {currentTimestamp
          ? `chain: ${new Date(Number(currentTimestamp) * 1000).toLocaleTimeString()}`
          : `local: ${new Date().toLocaleTimeString()}`}
      </div>
    </div>
  );
}
