import { useState, useEffect } from "react";

interface DateTimePickerProps {
  value: string; // ISO datetime string
  onChange: (isoString: string) => void;
  minDate?: string; // ISO date string (YYYY-MM-DD)
  minTime?: string; // HH:MM — time-of-day lower bound
  chainTimestamp?: bigint | null; // on-chain block.timestamp (seconds); used as reference instead of Date.now()
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

function toISOStringLocal(date: Date): string {
  // Format as ISO string with timezone offset suffix (e.g. "+08:00")
  // This ensures new Date(value) always interprets it as local time consistently
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absOffset = Math.abs(offset);
  const tzSuffix = `${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`;
  return (
    date.getFullYear() + "-" +
    pad(date.getMonth() + 1) + "-" +
    pad(date.getDate()) + "T" +
    pad(date.getHours()) + ":" +
    pad(date.getMinutes()) +
    tzSuffix
  );
}

export default function DateTimePicker({ value, onChange, minDate, minTime, chainTimestamp }: DateTimePickerProps) {
  // Use chain time as reference when available, fall back to browser time
  const refMs = chainTimestamp != null ? Number(chainTimestamp) * 1000 : Date.now();
  // Parse value into components, default to ref+1min if empty
  const initialDate = value ? new Date(value) : new Date(refMs + 60000);
  const [year, setYear] = useState(initialDate.getFullYear());
  const [month, setMonth] = useState(initialDate.getMonth());
  const [day, setDay] = useState(initialDate.getDate());
  const [hour, setHour] = useState(initialDate.getHours());
  const [minute, setMinute] = useState(initialDate.getMinutes());

  // Re-sync internal state when value prop changes (e.g., after parent updates datetime)
  useEffect(() => {
    if (!value) return;
    const d = new Date(value);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setDay(d.getDate());
    setHour(d.getHours());
    setMinute(d.getMinutes());
  }, [value]);

  const now = new Date(refMs);
  const minYear = now.getFullYear();
  const maxYear = minYear + 10;
  const daysInCurrentMonth = getDaysInMonth(year, month);

  const MIN_LOCK_MS = 300 * 1000; // 5 minutes minimum — must match contract MIN_LOCK_SECONDS

  function notify() {
    const selected = new Date(year, month, day, hour, minute, 0);
    // Use chain time as reference when available, not stale closure of browser time
    const refMsFresh = chainTimestamp != null ? Number(chainTimestamp) * 1000 : Date.now();
    let minValid = new Date(refMsFresh + MIN_LOCK_MS);

    // Apply minTime (HH:MM) as an additional time-of-day lower bound on the selected date
    if (minTime) {
      const [minH, minM] = minTime.split(":").map(Number);
      const minTimeOnDay = new Date(year, month, day, minH, minM, 0);
      if (minTimeOnDay.getTime() > minValid.getTime()) {
        minValid = minTimeOnDay;
      }
    }

    if (selected.getTime() < minValid.getTime()) {
      // Clamp to minimum valid time and update internal state so dropdowns match emitted value
      const newYear = minValid.getFullYear();
      const newMonth = minValid.getMonth();
      const newDay = minValid.getDate();
      const newHour = minValid.getHours();
      const newMinute = Math.ceil(minValid.getMinutes() / 5) * 5; // round up to next 5-min increment
      setYear(newYear);
      setMonth(newMonth);
      setDay(newDay);
      setHour(newHour);
      setMinute(newMinute);
      onChange(toISOStringLocal(minValid));
      return;
    }
    onChange(toISOStringLocal(selected));
  }

  function handleMonthChange(m: number) {
    setMonth(m);
    if (day > getDaysInMonth(year, m)) setDay(getDaysInMonth(year, m));
    setTimeout(notify, 0);
  }

  function handleYearChange(y: number) {
    setYear(y);
    if (day > getDaysInMonth(y, month)) setDay(getDaysInMonth(y, month));
    setTimeout(notify, 0);
  }

  function handleDayChange(d: number) { setDay(d); setTimeout(notify, 0); }
  function handleHourChange(h: number) { setHour(h); setTimeout(notify, 0); }
  function handleMinuteChange(m: number) { setMinute(m); setTimeout(notify, 0); }

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      {/* Year */}
      <select
        value={year}
        onChange={e => handleYearChange(Number(e.target.value))}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "0.6rem 0.4rem",
          color: "var(--text)",
          fontSize: "0.9rem",
          cursor: "pointer",
          minWidth: "80px",
        }}
      >
        {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      {/* Month */}
      <select
        value={month}
        onChange={e => handleMonthChange(Number(e.target.value))}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "0.6rem 0.4rem",
          color: "var(--text)",
          fontSize: "0.9rem",
          cursor: "pointer",
          minWidth: "120px",
        }}
      >
        {MONTHS.map((mName, idx) => (
          <option key={idx} value={idx}>{mName}</option>
        ))}
      </select>

      {/* Day */}
      <select
        value={day}
        onChange={e => handleDayChange(Number(e.target.value))}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "0.6rem 0.4rem",
          color: "var(--text)",
          fontSize: "0.9rem",
          cursor: "pointer",
          minWidth: "65px",
        }}
      >
        {Array.from({ length: daysInCurrentMonth }, (_, i) => i + 1).map(d => (
          <option key={d} value={d}>{pad(d)}</option>
        ))}
      </select>

      {/* Hour */}
      <select
        value={hour}
        onChange={e => handleHourChange(Number(e.target.value))}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "0.6rem 0.4rem",
          color: "var(--text)",
          fontSize: "0.9rem",
          cursor: "pointer",
          minWidth: "70px",
        }}
      >
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={i}>{pad(i)}</option>
        ))}
      </select>

      <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>:</span>

      {/* Minute */}
      <select
        value={minute}
        onChange={e => handleMinuteChange(Number(e.target.value))}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "0.6rem 0.4rem",
          color: "var(--text)",
          fontSize: "0.9rem",
          cursor: "pointer",
          minWidth: "70px",
        }}
      >
        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
          <option key={m} value={m}>{pad(m)}</option>
        ))}
      </select>
    </div>
  );
}
