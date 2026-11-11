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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

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

// The YYYY-MM a stake bonus snapshot URL names (the index validator makes every URL end with it).
export const snapshotMonth = (url: string): string | null =>
  url.match(/\/poh-stake-bonus-(\d{4}-(?:0[1-9]|1[0-2]))\.json$/)?.[1] ?? null;

/**
 * The payments in one stake bonus snapshot. Throws, saying why, for a file the page can't trust: not the schema it
 * reads, not the month its URL names, or totals that aren't the sum of its lines. Such a file is left out whole
 * rather than shown in part.
 */
export function bonusRewards(url: string, raw: unknown): PohReward[] {
  if (!isObject(raw)) throw new Error("not a snapshot");
  if (raw.schema !== STAKE_BONUS_SCHEMA) throw new Error(`schema "${text(raw.schema)}", expected "${STAKE_BONUS_SCHEMA}"`);
  const label = isObject(raw.period) ? text(raw.period.label) : "";
  if (label === "" || label !== snapshotMonth(url)) throw new Error(`period "${label}" isn't the month its URL names`);
  if (!isObject(raw.recipients)) throw new Error("no recipients");

  const rewards: PohReward[] = [];
  let sum = 0n;
  for (const [key, recipient] of Object.entries(raw.recipients)) {
    const address = key.toLowerCase();
    if (!ADDRESS.test(address)) throw new Error(`recipient "${key}" isn't an address`);
    const lines = isObject(recipient) ? recipient.stakeBonus : undefined;
    if (!Array.isArray(lines)) throw new Error(`${address} has no stakeBonus lines`);
    let recipientSum = 0n;
    for (const line of lines) {
      const fields = isObject(line) ? line : {};
      const amount = toWei(text(fields.amount));
      const txHash = text(fields.txHash).toLowerCase();
      const windowEnd = text(fields.windowEnd);
      recipientSum += amount;
      rewards.push({
        kind: "stakeBonus",
        address,
        humanityId: text(fields.humanityId).toLowerCase(),
        amount,
        paidAt: text(fields.paidAt),
        month: label,
        // only ever used to build an explorer link, so only a real hash is kept
        txHash: TX_HASH.test(txHash) ? txHash : undefined,
        windowEnd: DAY.test(windowEnd) ? windowEnd : undefined,
      });
    }
    if (recipientSum !== toWei(text(isObject(recipient) ? recipient.total : undefined))) {
      throw new Error(`${address}'s lines don't add up to its total`);
    }
    sum += recipientSum;
  }
  const total = isObject(raw.totals) ? toWei(text(raw.totals.total)) : 0n;
  if (sum !== total) throw new Error(`its lines add up to ${sum} wei, but its total is ${total}`);
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
    if (!wallet.humanityId) wallet.humanityId = reward.humanityId;
  }
  return [...wallets.values()];
}
