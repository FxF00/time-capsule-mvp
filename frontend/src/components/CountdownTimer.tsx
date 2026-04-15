import { useState, useEffect } from "react";

interface CountdownTimerProps {
  unlockTimestamp: bigint; // Unix seconds
  onExpire?: () => void;
  /** Current block timestamp in seconds. Falls back to Date.now() if not provided. */
  currentTimestamp?: bigint;
  compact?: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function getTimeRemaining(unlockTs: bigint, currentTs: bigint): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
  totalSeconds: number;
  elapsedSeconds: number;
} {
  if (currentTs >= unlockTs) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true, totalSeconds: 0, elapsedSeconds: 0 };
  }
  const diff = Number(unlockTs - currentTs);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  return { days, hours, minutes, seconds, expired: false, totalSeconds: diff, elapsedSeconds: 0 };
}

function CountdownRing({ progress, expired }: { progress: number; expired: boolean }) {
  // SVG ring parameters
  const size = 80;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.max(0, Math.min(1, progress)));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="countdown-ring-svg"
      style={{ display: "block" }}
    >
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="countdown-ring-bg"
        strokeWidth={strokeWidth}
      />
      {/* Progress ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className={`countdown-ring-progress ${expired ? "expired" : ""}`}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        style={{
          // Smooth CSS transition handled via class, but we also set directly
          transition: "stroke-dashoffset 1s linear, stroke 0.3s",
        }}
      />
    </svg>
  );
}

export default function CountdownTimer({
  unlockTimestamp,
  onExpire,
  currentTimestamp,
  compact,
}: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => {
    const now = currentTimestamp ?? BigInt(Math.floor(Date.now() / 1000));
    return getTimeRemaining(unlockTimestamp, now);
  });

  // Estimate total lock duration for progress ring
  // We don't have the original lock duration stored, so we compute
  // a rough estimate: show progress as time elapsed since creation
  // vs total time. We track elapsed locally.
  const [elapsedTotal, setElapsedTotal] = useState<number | null>(null);

  useEffect(() => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const r = getTimeRemaining(unlockTimestamp, now);
    setRemaining(r);
    if (r.expired) return;

    // Track elapsed for progress ring (once we know total)
    // We don't have createdAt here, so we'll use a heuristic:
    // If remaining < 7 days, assume total = remaining + some elapsed (no good estimate)
    // For progress ring we show inverse of remaining / assumed total
    // A simple approach: show remaining time as "time left" ring depleting
    // We assume max display of 1 year for progress
    const ASSUMED_MAX_SECS = 365 * 86400;
    setElapsedTotal(ASSUMED_MAX_SECS - r.totalSeconds);

    const interval = setInterval(() => {
      const nowFresh = BigInt(Math.floor(Date.now() / 1000));
      const r2 = getTimeRemaining(unlockTimestamp, nowFresh);
      setRemaining(r2);
      if (r2.expired) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [unlockTimestamp, onExpire]);

  if (remaining.expired) {
    if (compact) {
      return (
        <span className="text-success font-bold" style={{ fontSize: "0.85rem" }}>
          Unlocked
        </span>
      );
    }
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="countdown-wrapper">
          <CountdownRing progress={1} expired={true} />
          <div className="countdown-digits expired" style={{ fontSize: "1rem" }}>
            ✓
          </div>
        </div>
        <p className="text-success font-bold" style={{ fontSize: "1.25rem" }}>Unlocked!</p>
      </div>
    );
  }

  if (compact) {
    return (
      <span className="font-mono text-sm text-accent" style={{ letterSpacing: "0.04em" }}>
        {remaining.days > 0 && <span>{remaining.days}d </span>}
        <span>{pad(remaining.hours)}h </span>
        <span>{pad(remaining.minutes)}m </span>
        <span>{pad(remaining.seconds)}s</span>
      </span>
    );
  }

  // Compute progress: elapsed / (elapsed + remaining)
  // We don't have exact elapsed without createdAt, so use a practical approach:
  // Progress = 1 - (remaining / ASSUMED_MAX), where ASSUMED_MAX is a generous upper bound
  const ASSUMED_MAX_SECS = 365 * 86400;
  const progress = 1 - remaining.totalSeconds / ASSUMED_MAX_SECS;

  const timeString =
    remaining.days > 0
      ? `${remaining.days}d ${pad(remaining.hours)}h ${pad(remaining.minutes)}m ${pad(remaining.seconds)}s`
      : `${pad(remaining.hours)}h ${pad(remaining.minutes)}m ${pad(remaining.seconds)}s`;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="countdown-wrapper">
        <CountdownRing progress={progress} expired={false} />
        <div className="countdown-digits" style={{ fontSize: "0.7rem", lineHeight: 1.3 }}>
          {remaining.days > 0 ? (
            <>
              <div>{remaining.days}d</div>
              <div>{pad(remaining.hours)}:{pad(remaining.minutes)}:{pad(remaining.seconds)}</div>
            </>
          ) : (
            <div>
              {pad(remaining.hours)}:{pad(remaining.minutes)}:{pad(remaining.seconds)}
            </div>
          )}
        </div>
      </div>
      {/* Current time reference */}
      <div className="countdown-ref">
        {currentTimestamp
          ? `chain: ${new Date(Number(currentTimestamp) * 1000).toLocaleTimeString()}`
          : `local: ${new Date().toLocaleTimeString()}`}
      </div>
    </div>
  );
}
