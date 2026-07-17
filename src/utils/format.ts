import { WEI } from "consts/index";

// "1234567.89" style PNK amount from a wei bigint (truncated to 2 decimals).
export function formatPNK(wei: bigint): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / WEI;
  const frac = ((abs % WEI) * 100n) / WEI;
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}.${frac.toString().padStart(2, "0")}`;
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
