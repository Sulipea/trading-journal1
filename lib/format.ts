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
