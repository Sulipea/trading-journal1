const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** `$1,234.50`; with `signed`, positive values get a leading `+` so sign never relies on colour. */
export function formatMoney(value: number, options: { signed?: boolean } = {}): string {
  const text = usd.format(value);
  return options.signed && value > 0 ? `+${text}` : text;
}

export function formatPercent(fraction: number | null, digits = 1): string {
  return fraction === null ? "—" : `${(fraction * 100).toFixed(digits)}%`;
}

export function formatRatio(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

/** R multiple with sign, e.g. `+1.50R`. */
export function formatR(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}R`;
}

/** Futures prices: always show quarter-point precision. */
export function formatPrice(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

export function formatDateTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

/** `1h 05m`, `12m 30s`, `45s`. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** ISO timestamp → value for an `<input type="datetime-local">` in the browser's local time. */
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** `<input type="datetime-local">` value (browser local time) → ISO timestamp, or `null` if invalid. */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
