import { WEI } from "consts/index";

// "1234567.89" style PNK amount from a wei bigint (truncated to 2 decimals).
export function formatPNK(wei: bigint): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / WEI;
  const frac = ((abs % WEI) * 100n) / WEI;
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}.${frac.toString().padStart(2, "0")}`;
}

// "1,234,568" style PNK amount from a wei bigint, rounded to whole PNK — for
// the narrative overview figures, where decimals are noise.
export function formatPNKWhole(wei: bigint): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const rounded = (abs + WEI / 2n) / WEI;
  return `${negative ? "-" : ""}${rounded.toLocaleString("en-US")}`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-06" -> "Jun 2026"; the combined "2021-01 & 02" bucket -> "Jan & Feb 2021".
export function formatMonthLabel(label: string): string {
  const combined = label.match(/^(\d{4})-(\d{2}) & (\d{2})$/);
  if (combined) {
    return `${MONTH_NAMES[Number(combined[2]) - 1]} & ${MONTH_NAMES[Number(combined[3]) - 1]} ${combined[1]}`;
  }
  const match = label.match(/^(\d{4})-(\d{2})$/);
  if (!match) return label;
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

// Inclusive calendar span between two "YYYY-MM" labels, in months (null when
// either label doesn't parse — e.g. the combined "2021-01 & 02" bucket).
export function monthSpan(first: string, last: string): number | null {
  const parse = (label: string) => {
    const match = label.match(/^(\d{4})-(\d{2})/);
    return match ? Number(match[1]) * 12 + Number(match[2]) : null;
  };
  const a = parse(first);
  const b = parse(last);
  return a === null || b === null ? null : Math.abs(b - a) + 1;
}

// "4 years 1 month" from a month count.
export function formatDuration(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (rest > 0 || years === 0) parts.push(`${rest} month${rest === 1 ? "" : "s"}`);
  return parts.join(" ");
}

// Month count with a year breakdown once it reaches a year, e.g. "13 (1 Year and 1 Month)".
export function formatMonthCount(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return String(months);
  const parts = [`${years} Year${years === 1 ? "" : "s"}`];
  if (rest > 0) parts.push(`${rest} Month${rest === 1 ? "" : "s"}`);
  return `${months} (${parts.join(" and ")})`;
}

// Wei bigint -> PNK as a plain number rounded to 2 decimals (for spreadsheet exports).
export function toPnkNumber(wei: bigint): number {
  return Number((wei * 100n) / WEI) / 100;
}

export function hexToWei(hex: string | undefined): bigint {
  if (!hex) return 0n;
  try {
    return BigInt(hex.startsWith("0x") || hex.startsWith("-0x") ? hex : `0x${hex}`);
  } catch {
    return 0n;
  }
}

export function toWei(value: string | undefined): bigint {
  try {
    return BigInt(value || "0");
  } catch {
    return 0n;
  }
}

export function shortAddress(addr: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","))
    .join("\n");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
