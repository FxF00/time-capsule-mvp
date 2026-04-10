import { useState } from "react";

interface DateTimePickerProps {
  value: string; // ISO datetime string
  onChange: (isoString: string) => void;
  minDate?: string; // ISO date string (YYYY-MM-DD)
  minTime?: string; // HH:MM
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

export default function DateTimePicker({ value, onChange, minDate }: DateTimePickerProps) {
  // Parse value into components, default to now+1min if empty
  const initialDate = value ? new Date(value) : new Date(Date.now() + 60000);
  const [year, setYear] = useState(initialDate.getFullYear());
  const [month, setMonth] = useState(initialDate.getMonth());
  const [day, setDay] = useState(initialDate.getDate());
  const [hour, setHour] = useState(initialDate.getHours());
  const [minute, setMinute] = useState(initialDate.getMinutes());

  const now = new Date();
  const minYear = now.getFullYear();
  const maxYear = minYear + 10;
  const daysInCurrentMonth = getDaysInMonth(year, month);

  const MIN_LOCK_MS = 86400 * 1000; // 1 day minimum — must match contract MIN_LOCK_SECONDS

  function notify() {
    const selected = new Date(year, month, day, hour, minute, 0);
    const nowFresh = new Date(); // always use current time, not stale closure
    if (selected.getTime() < nowFresh.getTime() + MIN_LOCK_MS) {
      return; // Don't update if less than 1 day from now
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
