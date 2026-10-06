/**
 * Built-in futures contract specifications (spec §7).
 * V1 supports ES, MES, NQ and MNQ only.
 */

export const INSTRUMENT_ROOTS = ["ES", "MES", "NQ", "MNQ"] as const;
export type InstrumentRoot = (typeof INSTRUMENT_ROOTS)[number];

export interface ContractSpec {
  root: InstrumentRoot;
  name: string;
  /** Minimum price increment, in index points. */
  tickSize: number;
  /** Dollar value of one full index point per contract. */
  pointValue: number;
}

export const CONTRACT_SPECS: Readonly<Record<InstrumentRoot, ContractSpec>> = {
  ES: { root: "ES", name: "E-mini S&P 500", tickSize: 0.25, pointValue: 50 },
  MES: { root: "MES", name: "Micro E-mini S&P 500", tickSize: 0.25, pointValue: 5 },
  NQ: { root: "NQ", name: "E-mini Nasdaq-100", tickSize: 0.25, pointValue: 20 },
  MNQ: { root: "MNQ", name: "Micro E-mini Nasdaq-100", tickSize: 0.25, pointValue: 2 },
};

export function tickValue(spec: ContractSpec): number {
  return spec.tickSize * spec.pointValue;
}

/** CME month codes. */
const MONTH_CODES = "FGHJKMNQUVXZ";

export interface ParsedContractSymbol {
  symbol: string;
  root: InstrumentRoot;
  monthCode: string;
  /** 1–12 */
  month: number;
  /** Year digit(s) as written, e.g. "6" or "26". */
  year: string;
}

// Longest roots first so "MES" is not mistaken for "ES".
const SYMBOL_PATTERN = /^(MES|MNQ|ES|NQ)([FGHJKMNQUVXZ])(\d{1,2})$/;

/**
 * Parse a manually entered contract symbol such as `ESZ6` or `MNQH27`.
 * Returns `null` if the symbol is not a supported V1 contract.
 */
export function parseContractSymbol(input: string): ParsedContractSymbol | null {
  const symbol = input.trim().toUpperCase();
  const match = SYMBOL_PATTERN.exec(symbol);
  if (!match) return null;
  const [, root, monthCode, year] = match as unknown as [string, InstrumentRoot, string, string];
  return {
    symbol,
    root,
    monthCode,
    month: MONTH_CODES.indexOf(monthCode) + 1,
    year,
  };
}

export function specForSymbol(symbol: string): ContractSpec | null {
  const parsed = parseContractSymbol(symbol);
  return parsed ? CONTRACT_SPECS[parsed.root] : null;
}
