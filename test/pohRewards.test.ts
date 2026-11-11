import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  aggregate,
  bonusRewards,
  claimReward,
  countHumans,
  snapshotMonth,
  walletTotals,
  type PohReward,
} from "../src/utils/pohRewards.ts";

const PNK = 10n ** 18n;
const NOVEMBER_URL = "https://cdn.kleros.link/ipfs/QmUC6SK9ZoZ9y7DL1UygWgDRpq4Qvd5m9euDWDBvHXJA1h/poh-stake-bonus-2026-11.json";
const TX = "0xea3f6f924cf872e587176938e3bb009fbdcfaf1895ea6215df40a000bb0fbc61";
const A = "0x5be1580bbdff10b11cccd85ab4a9a455655dfde2";
const B = "0x96cdea52111684fd74ec6cdf31dd97f395737a5d";

const line = (humanityId: string, windowEnd: string) => ({
  humanityId,
  windowEnd,
  txHash: TX,
  paidAt: "2026-11-04T09:42:05.000Z",
  amount: (1200n * PNK).toString(),
});

// The shape npm run snapshot writes (Proof-Of-Humanity/poh-airdrop-stake-rewards), trimmed to two recipients.
const snapshot = () => ({
  schema: "poh-stake-bonus/v1",
  period: { label: "2026-11", start: "2026-11-01T00:00:00.000Z", end: "2026-12-01T00:00:00.000Z" },
  generatedAt: "2026-11-11T22:15:51.977Z",
  chainId: 100,
  token: { symbol: "stPNK", address: "0xcb3231aBA3b451343e0Fddfc45883c842f223846" },
  totals: { stakeBonus: (2400n * PNK).toString(), total: (2400n * PNK).toString(), recipientCount: 2 },
  recipients: {
    [A]: { total: (1200n * PNK).toString(), stakeBonus: [line(A, "2026-08-06")] },
    [B]: { total: (1200n * PNK).toString(), stakeBonus: [line(B, "2026-09-26")] },
  } as Record<string, { total: string; stakeBonus: ReturnType<typeof line>[] }>,
  note: "",
});

const claim = (humanityId: string, wallet: string, isoTime: string): PohReward =>
  claimReward({
    id: humanityId,
    amount: (1200n * PNK).toString(),
    timestamp: String(Date.parse(isoTime) / 1000),
    claimer: { id: wallet },
  });

test("a stake bonus snapshot becomes one payment per line, in the month its URL names", () => {
  const rewards = bonusRewards(NOVEMBER_URL, snapshot());
  assert.equal(rewards.length, 2);
  assert.deepEqual(rewards[0], {
    kind: "stakeBonus",
    address: A,
    humanityId: A,
    amount: 1200n * PNK,
    paidAt: "2026-11-04T09:42:05.000Z",
    month: "2026-11",
    txHash: TX,
    windowEnd: "2026-08-06",
  });
});

test("recipient keys and humanity IDs are lowercased, so a checksummed key still matches the claim", () => {
  const raw = snapshot();
  const checksummed = "0x5BE1580bBDFF10B11cCcD85Ab4a9a455655dfdE2";
  raw.recipients[checksummed] = { ...raw.recipients[A], stakeBonus: [line(checksummed, "2026-08-06")] };
  delete raw.recipients[A];
  const [reward] = bonusRewards(NOVEMBER_URL, raw).filter((r) => r.windowEnd === "2026-08-06");
  assert.equal(reward.address, A);
  assert.equal(reward.humanityId, A);
});

test("a snapshot the page can't trust is refused whole, saying why", () => {
  const refuses = (mutate: (raw: ReturnType<typeof snapshot>) => unknown, why: RegExp, url = NOVEMBER_URL) => {
    const raw = snapshot();
    const replaced = mutate(raw);
    assert.throws(() => bonusRewards(url, replaced === undefined ? raw : replaced), why);
  };
  refuses(() => null, /not a snapshot/);
  refuses(() => [], /not a snapshot/);
  refuses((raw) => void (raw.schema = "curate-rewards/v1"), /schema "curate-rewards\/v1"/);
  refuses((raw) => void (raw.period.label = "2026-10"), /period "2026-10" isn't the month its URL names/);
  refuses(() => snapshot(), /isn't the month its URL names/, NOVEMBER_URL.replace("2026-11", "2026-12"));
  refuses((raw) => ({ ...raw, recipients: [] }), /no recipients/);
  refuses((raw) => void (raw.recipients["0x1234"] = raw.recipients[A]), /recipient "0x1234" isn't an address/);
  refuses((raw) => void ((raw.recipients[A] as { stakeBonus: unknown }).stakeBonus = "1200"), /has no stakeBonus lines/);
  // the docs' hard rules: each recipient's total and the grand total are the sum of the lines
  refuses((raw) => void (raw.recipients[A].total = "1"), /lines don't add up to its total/);
  refuses((raw) => void (raw.totals.total = (3600n * PNK).toString()), /its lines add up to .* but its total is/);
  // an amount that isn't a decimal wei string reads as 0, which then fails the totals check
  refuses((raw) => void (raw.recipients[A].stakeBonus[0].amount = "1.2e21"), /lines don't add up to its total/);
});

test("a malformed transaction hash or window end is dropped rather than linked or shown", () => {
  const raw = snapshot();
  raw.recipients[A].stakeBonus[0].txHash = "javascript:alert(1)";
  raw.recipients[A].stakeBonus[0].windowEnd = "soon";
  const [reward] = bonusRewards(NOVEMBER_URL, raw);
  assert.equal(reward.txHash, undefined);
  assert.equal(reward.windowEnd, undefined);
});

test("the snapshot month comes from the URL's file name", () => {
  assert.equal(snapshotMonth(NOVEMBER_URL), "2026-11");
  assert.equal(snapshotMonth("https://cdn.kleros.link/ipfs/Qm/poh-stake-bonus-2026-13.json"), null);
  assert.equal(snapshotMonth("https://cdn.kleros.link/ipfs/Qm/curate-rewards-2026-11.json"), null);
});

test("every published URL in the bundled index names its month", () => {
  const index = JSON.parse(readFileSync(new URL("../src/assets/poh-stake-bonus-index.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(index) && index.length > 0);
  for (const url of index) assert.match(String(snapshotMonth(url)), /^\d{4}-\d{2}$/, url);
});

test("claims count in their UTC claim month, bonuses in their snapshot's month", () => {
  const rewards = [
    claim(A, A, "2026-02-06T15:28:10.000Z"),
    claim(B, B, "2026-03-26T04:16:00.000Z"),
    // 23:30 UTC on 31 March is still March, wherever the browser is
    claim("0xe1f1ce92499c9985fe24d7f631095e31a88de0a7", "0xe1f1ce92499c9985fe24d7f631095e31a88de0a7", "2026-03-31T23:30:00.000Z"),
    ...bonusRewards(NOVEMBER_URL, snapshot()),
  ];
  const data = aggregate(rewards, 1);
  assert.deepEqual(
    data.months.map((m) => [m.label, m.claims, m.bonuses, m.humans, m.airdrop / PNK, m.stakeBonus / PNK, m.total / PNK]),
    [
      ["2026-11", 0, 2, 2, 0n, 2400n, 2400n],
      ["2026-03", 2, 0, 2, 2400n, 0n, 2400n],
      ["2026-02", 1, 0, 1, 1200n, 0n, 1200n],
    ]
  );
  assert.equal(data.bonusSnapshots, 1);
  assert.equal(data.rewards.length, 5);
});

test("a human paid the airdrop and the stake bonus is one human, and one wallet row with both", () => {
  const rewards = [claim(A, A, "2026-02-06T15:28:10.000Z"), claim(B, B, "2026-03-26T04:16:00.000Z"), ...bonusRewards(NOVEMBER_URL, snapshot())];
  assert.equal(countHumans(rewards), 2);
  const wallets = walletTotals(rewards);
  assert.equal(wallets.length, 2);
  assert.deepEqual(wallets.find((w) => w.address === A), {
    address: A,
    humanityId: A,
    airdrop: 1200n * PNK,
    stakeBonus: 1200n * PNK,
    total: 2400n * PNK,
  });
});

test("a wallet whose humanity ID differs keeps it, and humans are counted by humanity", () => {
  const safe = "0x3693df71e1120476a20f82dfaff0067260156c8a";
  const humanity = "0xd14eb612c81e87c7861b458914ed78a1dc1ab3cf";
  const rewards = [claim(humanity, safe, "2026-01-23T10:02:15.000Z")];
  assert.equal(rewards[0].address, safe);
  assert.equal(rewards[0].humanityId, humanity);
  assert.equal(walletTotals(rewards)[0].humanityId, humanity);
  // a payment without a humanity ID falls back to its wallet
  assert.equal(countHumans([{ ...rewards[0], humanityId: "" }, rewards[0]]), 2);
});
