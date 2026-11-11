import assert from "node:assert/strict";
import test from "node:test";

import type { CurateSnapshot, RewardLine } from "../src/hooks/useCurateRewards.ts";
import { atqKind, splitAtq, splitAtqByRecipient, splitAtqLines } from "../src/utils/curateAtq.ts";
import { layoutSpans } from "../src/utils/tableSpans.ts";

const PNK = (n: number | string): string => (BigInt(Math.round(Number(n) * 1000)) * 10n ** 15n).toString();

// The line shapes the published snapshots use (see utils/curateAtq).
const itemized = (status: string, amount: string): RewardLine => ({
  registry: "atq",
  chain: "",
  chainName: status,
  tagAddress: "0x77ac54d11d5a5d404b8d3e84b183e0b58386650947701354e016c7c1a9017cad",
  amount,
});
const aggregate = (status: string, amount: string): RewardLine => ({
  registry: "atq",
  chain: "",
  chainName: status,
  tagAddress: "",
  amount,
});

const month = (atq: string, recipients: Record<string, RewardLine[]>): CurateSnapshot => ({
  totals: { atq },
  recipients: Object.fromEntries(Object.entries(recipients).map(([addr, lines]) => [addr, { atq: lines }])),
});

test("tells ATQ submissions from ATQ removals by the status in the line's chainName slot", () => {
  assert.equal(atqKind(itemized("registered", PNK(3000))), "submission");
  assert.equal(atqKind(itemized("removed", PNK(500))), "removal");
  assert.equal(atqKind(aggregate("registered", PNK(60000))), "submission");
  assert.equal(atqKind(aggregate("removed", PNK(1500))), "removal");
  for (const status of ["", "Registered", "Gnosis", undefined]) {
    assert.equal(atqKind({ ...aggregate("", PNK(1)), chainName: status }), null, String(status));
  }
});

test("splits an itemized month, as October 2026 was paid", () => {
  const removal = "464285714285714285714";
  const october = month(
    (BigInt(PNK(60000)) + 14n * BigInt(removal)).toString(),
    {
      "0x9f4f53194c63541e6930f75cd9d403ca4d3f6ca4": Array.from({ length: 20 }, () => itemized("registered", PNK(3000))),
      "0x03f28fd8e91e5c821cc7aa4da3fed7c4de0102aa": Array.from({ length: 14 }, () => itemized("removed", removal)),
      "0x20881b01ba2b8af95cc190aa3dee384720b7fef7": [],
    }
  );
  assert.deepEqual(splitAtq(october), { submissions: BigInt(PNK(60000)), removals: 14n * BigInt(removal) });
  assert.deepEqual(splitAtqByRecipient(october), {
    "0x9f4f53194c63541e6930f75cd9d403ca4d3f6ca4": { submissions: BigInt(PNK(60000)), removals: 0n },
    "0x03f28fd8e91e5c821cc7aa4da3fed7c4de0102aa": { submissions: 0n, removals: 14n * BigInt(removal) },
    "0x20881b01ba2b8af95cc190aa3dee384720b7fef7": { submissions: 0n, removals: 0n },
  });
});

test("splits a month amended with one aggregate line per recipient, each of one kind (2026-04)", () => {
  const april = month(PNK(61500), {
    "0x55df": [aggregate("registered", PNK(60000))],
    "0x5192": [aggregate("removed", PNK(1500))],
  });
  assert.deepEqual(splitAtq(april), { submissions: BigInt(PNK(60000)), removals: BigInt(PNK(1500)) });
});

test("does not split a month with an aggregate line for both kinds (2026-02), even partly", () => {
  const february = month(PNK(63000), {
    "0x5e42": [aggregate("removed", PNK(1000))],
    "0x55df": [aggregate("", PNK(62000))],
  });
  assert.equal(splitAtq(february), null);
  assert.equal(splitAtqByRecipient(february), null);
  assert.equal(splitAtqLines(february.recipients?.["0x55df"]?.atq), null);
  assert.deepEqual(splitAtqLines(february.recipients?.["0x5e42"]?.atq), { submissions: 0n, removals: BigInt(PNK(1000)) });
});

test("never splits ATQ that does not add up to the month's published ATQ total, to the wei", () => {
  const lines = { "0xa": [itemized("registered", PNK(3000))], "0xb": [itemized("removed", PNK(500))] };
  assert.notEqual(splitAtq(month(PNK(3500), lines)), null);
  assert.equal(splitAtq(month((BigInt(PNK(3500)) + 1n).toString(), lines)), null, "one wei more published");
  assert.equal(splitAtq(month((BigInt(PNK(3500)) - 1n).toString(), lines)), null, "one wei less published");
  // A total with no lines at all (as the ATQ months were before their amendment)
  assert.equal(splitAtq(month(PNK(66660), {})), null);
  assert.equal(splitAtq({ totals: { atq: PNK(66660) } }), null);
});

test("splits a month without ATQ into nothing, whatever shape its totals take", () => {
  assert.deepEqual(splitAtq(month("0", { "0xa": [] })), { submissions: 0n, removals: 0n });
  assert.deepEqual(splitAtq({}), { submissions: 0n, removals: 0n });
  assert.deepEqual(splitAtq({ totals: {}, recipients: { "0xa": {} } }), { submissions: 0n, removals: 0n });
});

test("lays out cells that cover several columns, never past the row's end", () => {
  const spans = (count: number, asked: Record<number, number>) => layoutSpans(count, (c) => asked[c]);
  assert.deepEqual(spans(4, {}), [[0, 1], [1, 1], [2, 1], [3, 1]]);
  assert.deepEqual(spans(8, { 4: 2 }), [[0, 1], [1, 1], [2, 1], [3, 1], [4, 2], [6, 1], [7, 1]]);
  assert.deepEqual(spans(4, { 3: 2 }), [[0, 1], [1, 1], [2, 1], [3, 1]], "clamped to the columns left");
  assert.deepEqual(spans(4, { 1: 9 }), [[0, 1], [1, 3]]);
  assert.deepEqual(spans(3, { 0: 0, 1: -2, 2: NaN }), [[0, 1], [1, 1], [2, 1]], "a span is at least 1");
  assert.deepEqual(spans(3, { 0: 1.7 }), [[0, 1], [1, 1], [2, 1]], "a whole number");
  assert.deepEqual(spans(0, {}), []);
});
