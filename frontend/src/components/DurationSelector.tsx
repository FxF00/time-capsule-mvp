import React from "react";

interface DurationSelectorProps {
  value: number | null;
  onChange: (seconds: number) => void;
  minDuration?: number;
}

const DURATIONS = [
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
  { label: "1h", seconds: 3600 },
  { label: "1d", seconds: 86400 },
  { label: "7d", seconds: 604800 },
  { label: "30d", seconds: 2592000 },
  { label: "1y", seconds: 31536000 },
];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) {
    const mins = seconds / 60;
    return mins === 1 ? "1 minute" : `${mins} minutes`;
  }
  if (seconds < 86400) {
    const hours = seconds / 3600;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  if (seconds < 2592000) {
    const days = seconds / 86400;
    return days === 1 ? "1 day" : `${days} days`;
  }
  if (seconds < 31536000) {
    const months = seconds / 2592000;
    return months === 1 ? "1 month" : `${months} months`;
  }
  const years = seconds / 31536000;
  return years === 1 ? "1 year" : `${years} years`;
}

export const DurationSelector: React.FC<DurationSelectorProps> = ({
  value,
  onChange,
  minDuration = 60,
}) => {
  return (
    <div>
      <div className="duration-grid">
        {DURATIONS.map(({ label, seconds }) => {
          const isSelected = value === seconds;
          const isDisabled = seconds < minDuration;

          return (
            <button
              key={label}
              className={`duration-btn ${isSelected ? "duration-btn-selected" : ""}`}
              onClick={() => !isDisabled && onChange(seconds)}
              disabled={isDisabled}
            >
              {label}
            </button>
          );
        })}
      </div>

      {value !== null && (
        <p className="duration-hint">
          Selected: {formatDuration(value)} ({value} seconds)
        </p>
      )}
    </div>
  );
};

export default DurationSelector;
