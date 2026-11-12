import { toWei } from "utils/format";

// The Proof of Humanity page shows every PNK payment of the program, from two sources:
// - the airdrop: a fixed amount each registered human claims once, read live from the PoH v2 subgraph;
// - the stake bonus: 1,200 PNK more for each human who kept at least 1,200 PNK staked in the Humanity court for six
//   months after claiming. It is paid in batches, outside the subgraph, so it comes from one snapshot per month of
//   payments (src/assets/poh-stake-bonus-index.json), built from the program's payout ledger.

export type PohKind = "airdrop" | "stakeBonus";

export interface PohReward {
  kind: PohKind;
  address: string; // the wallet paid, lowercase
  humanityId: string; // lowercase
  amount: bigint; // wei
  paidAt: string; // ISO 8601: when the airdrop was claimed, or the bonus payment's block time
  month: string; // YYYY-MM (UTC) it counts in
  txHash?: string; // stake bonus: the paying transaction
  windowEnd?: string; // stake bonus: YYYY-MM-DD, the day the six months of staking ended
}

export interface PohMonth {
  label: string; // YYYY-MM
  airdrop: bigint;
  stakeBonus: bigint;
  total: bigint;
  claims: number; // airdrop claims
  bonuses: number; // stake bonus payments
  humans: number; // distinct humans paid
  rewards: PohReward[];
}

export interface PohData {
  months: PohMonth[]; // newest first
  rewards: PohReward[];
  bonusSnapshots: number; // stake bonus snapshots loaded
}

export interface PohWallet {
  address: string;
  humanityId: string;
  airdrop: bigint;
  stakeBonus: bigint;
  total: bigint;
}

export const STAKE_BONUS_SCHEMA = "poh-stake-bonus/v1";

// One reward-claim row as returned by the subgraph. `id` is the humanityID;
// `claimer.id` is the wallet that received the PNK; `amount` is a wei string.
export interface RawClaim {
  id: string;
  amount: string;
  timestamp: string;
  claimer: { id: string };
}

const ADDRESS = /^0x[0-9a-f]{40}$/;
const TX_HASH = /^0x[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const WEI = /^(0|[1-9]\d*)$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
// Snapshot text quoted in an error message, kept short.
const clip = (value: unknown): string => {
  const shown = JSON.stringify(value) ?? String(value);
  return shown.length > 48 ? `${shown.slice(0, 47)}…` : shown;
};
// A decimal wei string, the only form the docs allow: no number, no float, no hex, no sign.
function wei(value: unknown, what: string): bigint {
  if (typeof value !== "string" || !WEI.test(value)) throw new Error(`${what} ${clip(value)} isn't a decimal wei string`);
  return BigInt(value);
}

export function toMonthLabel(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0"); // getUTCMonth is 0-based
  return `${year}-${month}`;
}

export function claimReward(raw: RawClaim): PohReward {
  const seconds = Number(raw.timestamp);
  return {
    kind: "airdrop",
    address: raw.claimer.id.toLowerCase(),
    humanityId: raw.id.toLowerCase(),
    amount: toWei(raw.amount),
    paidAt: new Date(seconds * 1000).toISOString(),
    month: toMonthLabel(seconds),
  };
}

// The YYYY-MM a stake bonus snapshot URL names: its path ends with it, as the
// index validator (scripts/validate-rewards-index.ts) checks the path too.
export function snapshotMonth(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  return pathname.match(/\/poh-stake-bonus-(\d{4}-(?:0[1-9]|1[0-2]))\.json$/)?.[1] ?? null;
}

/**
 * The payments in one stake bonus snapshot. Throws, saying why, for a file the page can't trust, which is then left
 * out whole rather than shown in part: not the schema it reads, not the month its URL names, a line that isn't a
 * payment (an amount that isn't a positive decimal wei string, a humanity ID or transaction hash that isn't one, a time
 * outside the month), the same payment twice, or totals that aren't the sum of the lines (the docs' hard rules).
 */
export function bonusRewards(url: string, raw: unknown): PohReward[] {
  if (!isObject(raw)) throw new Error("not a snapshot");
  if (raw.schema !== STAKE_BONUS_SCHEMA) throw new Error(`schema ${clip(raw.schema)}, expected "${STAKE_BONUS_SCHEMA}"`);
  const label = isObject(raw.period) ? text(raw.period.label) : "";
  if (label === "" || label !== snapshotMonth(url)) throw new Error(`period ${clip(label)} isn't the month its URL names`);
  if (!isObject(raw.recipients)) throw new Error("no recipients");
  const totals = isObject(raw.totals) ? raw.totals : {};

  const rewards: PohReward[] = [];
  const seen = new Set<string>();
  let sum = 0n;
  for (const [key, recipient] of Object.entries(raw.recipients)) {
    const address = key.toLowerCase();
    if (!ADDRESS.test(address)) throw new Error(`recipient ${clip(key)} isn't an address`);
    if (!isObject(recipient) || !Array.isArray(recipient.stakeBonus)) throw new Error(`${address} has no stakeBonus lines`);
    let recipientSum = 0n;
    recipient.stakeBonus.forEach((line: unknown, i: number) => {
      const where = `${address}'s line ${i + 1}`;
      if (!isObject(line)) throw new Error(`${where} isn't a payment`);
      const amount = wei(line.amount, `${where}: amount`);
      if (amount === 0n) throw new Error(`${where} pays nothing`);
      const humanityId = text(line.humanityId).toLowerCase();
      if (!ADDRESS.test(humanityId)) throw new Error(`${where}: humanity ID ${clip(line.humanityId)} isn't an address`);
      const txHash = text(line.txHash).toLowerCase();
      if (!TX_HASH.test(txHash)) throw new Error(`${where}: ${clip(line.txHash)} isn't a transaction hash`);
      const paidAt = text(line.paidAt);
      if (!ISO_TIME.test(paidAt) || Number.isNaN(Date.parse(paidAt)) || paidAt.slice(0, 7) !== label) {
        throw new Error(`${where}: paidAt ${clip(line.paidAt)} isn't a time in ${label}`);
      }
      if (seen.has(`${address}|${txHash}`)) throw new Error(`it lists the payment to ${address} in ${txHash} twice`);
      seen.add(`${address}|${txHash}`);
      const windowEnd = text(line.windowEnd);
      recipientSum += amount;
      rewards.push({
        kind: "stakeBonus",
        address,
        humanityId,
        amount,
        paidAt,
        month: label,
        txHash,
        // only shown, in a tooltip
        windowEnd: DAY.test(windowEnd) ? windowEnd : undefined,
      });
    });
    if (recipientSum !== wei(recipient.total, `${address}'s total`)) {
      throw new Error(`${address}'s lines don't add up to its total`);
    }
    sum += recipientSum;
  }
  for (const key of ["stakeBonus", "total"]) {
    if (wei(totals[key], `totals.${key}`) !== sum) {
      throw new Error(`its lines add up to ${sum} wei, but totals.${key} is ${clip(totals[key])}`);
    }
  }
  const recipientCount = Object.keys(raw.recipients).length;
  if (totals.recipientCount !== recipientCount) {
    throw new Error(`totals.recipientCount is ${clip(totals.recipientCount)}, but it has ${recipientCount} recipients`);
  }
  return rewards;
}

// How many humans the payments went to: one per humanity ID (the wallet stands in for a payment without one).
export function countHumans(rewards: PohReward[]): number {
  return new Set(rewards.map((reward) => reward.humanityId || reward.address)).size;
}

export function sumAmounts(rewards: PohReward[]): bigint {
  return rewards.reduce((sum, reward) => sum + reward.amount, 0n);
}

function summarize(label: string, rewards: PohReward[]): PohMonth {
  let airdrop = 0n;
  let stakeBonus = 0n;
  let claims = 0;
  let bonuses = 0;
  for (const reward of rewards) {
    if (reward.kind === "airdrop") {
      airdrop += reward.amount;
      claims++;
    } else {
      stakeBonus += reward.amount;
      bonuses++;
    }
  }
  return { label, airdrop, stakeBonus, total: airdrop + stakeBonus, claims, bonuses, humans: countHumans(rewards), rewards };
}

// Every payment, grouped by the month it counts in, newest month first.
export function aggregate(rewards: PohReward[], bonusSnapshots: number): PohData {
  const byMonth = new Map<string, PohReward[]>();
  for (const reward of rewards) {
    const bucket = byMonth.get(reward.month);
    if (bucket) bucket.push(reward);
    else byMonth.set(reward.month, [reward]);
  }
  const months = [...byMonth]
    .map(([label, monthRewards]) => summarize(label, monthRewards))
    .sort((a, b) => (a.label < b.label ? 1 : -1));
  return { months, rewards, bonusSnapshots };
}

// One row per wallet: what it got from each part of the program.
export function walletTotals(rewards: PohReward[]): PohWallet[] {
  const wallets = new Map<string, PohWallet>();
  for (const reward of rewards) {
    let wallet = wallets.get(reward.address);
    if (!wallet) {
      wallet = { address: reward.address, humanityId: reward.humanityId, airdrop: 0n, stakeBonus: 0n, total: 0n };
      wallets.set(reward.address, wallet);
    }
    if (reward.kind === "airdrop") wallet.airdrop += reward.amount;
    else wallet.stakeBonus += reward.amount;
    wallet.total += reward.amount;
    // The subgraph's humanity ID for the wallet wins over a snapshot's.
    if (reward.kind === "airdrop" || !wallet.humanityId) wallet.humanityId = reward.humanityId;
  }
  return [...wallets.values()];
}
