import assert from "node:assert/strict";
import test from "node:test";

import type { CurateSnapshot, RewardLine } from "../src/hooks/useCurateRewards.ts";
import {
  allTimeAtqSplit,
  atqCells,
  atqKind,
  breakDownAtq,
  monthAtqSplit,
  shownAtqSplit,
  splitAtqLines,
  sumAtqSplits,
} from "../src/utils/curateAtq.ts";
import { type Row, layoutSpans, sortRows } from "../src/utils/table.ts";

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

const splitAtq = (snapshot: CurateSnapshot) => breakDownAtq(snapshot)?.total ?? null;
const splitAtqByRecipient = (snapshot: CurateSnapshot) => breakDownAtq(snapshot)?.byRecipient ?? null;

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

test("keeps a month's recipients keyed as the snapshot keys them", () => {
  // the page looks each recipient's split up by the snapshot's own key
  const mixedCase = month(PNK(3500), {
    "0x9F4f53194C63541E6930F75Cd9D403CA4D3f6Ca4": [itemized("registered", PNK(3000))],
    "0x03f28fd8e91e5c821cc7aa4da3fed7c4de0102aa": [itemized("removed", PNK(500))],
  });
  assert.deepEqual(Object.keys(splitAtqByRecipient(mixedCase) ?? {}), [
    "0x9F4f53194C63541E6930F75Cd9D403CA4D3f6Ca4",
    "0x03f28fd8e91e5c821cc7aa4da3fed7c4de0102aa",
  ]);
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
  // an unmarked line is never left out to make the rest split, even when
  // the rest alone would add up to the published total
  const rest = month(PNK(1000), { "0x5e42": [aggregate("removed", PNK(1000))], "0x55df": [aggregate("", PNK(62000))] });
  assert.equal(splitAtq(rest), null);
  const itemizedRest = month(PNK(3000), { "0xa": [itemized("registered", PNK(3000)), itemized("", PNK(500))] });
  assert.equal(splitAtq(itemizedRest), null);
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

test("adds splits up, and cannot when any of them cannot be split", () => {
  const a = { submissions: 3n, removals: 1n };
  const b = { submissions: 2n, removals: 5n };
  assert.deepEqual(sumAtqSplits([a, b]), { submissions: 5n, removals: 6n });
  assert.deepEqual(sumAtqSplits([]), { submissions: 0n, removals: 0n });
  assert.equal(sumAtqSplits([a, null, b]), null);
});

test("tells what a month contributes to a split shown for it, or added across months", () => {
  const period = (snapshot: CurateSnapshot) => ({ snapshot, atq: breakDownAtq(snapshot) });
  const split = period(month(PNK(61500), { "0xa": [aggregate("registered", PNK(60000))], "0xb": [aggregate("removed", PNK(1500))] }));
  const mixed = period(month(PNK(63000), { "0xa": [aggregate("", PNK(63000))] }));
  const none = period(month("0", {}));
  // a published ATQ of 0 is no ATQ of either kind, whatever its lines say
  const zeroWithLines = period(month("0", { "0xa": [aggregate("registered", PNK(3000))], "0xb": [aggregate("", "0")] }));
  assert.deepEqual(monthAtqSplit(split), { submissions: BigInt(PNK(60000)), removals: BigInt(PNK(1500)) });
  assert.equal(monthAtqSplit(mixed), null);
  assert.deepEqual(monthAtqSplit(none), { submissions: 0n, removals: 0n });
  assert.deepEqual(monthAtqSplit(zeroWithLines), { submissions: 0n, removals: 0n });
  assert.deepEqual(allTimeAtqSplit([split, none, zeroWithLines]), { submissions: BigInt(PNK(60000)), removals: BigInt(PNK(1500)) });
  assert.equal(allTimeAtqSplit([split, mixed, none]), null);
  // a month's tab shows its ATQ split only when it has ATQ and it splits
  assert.equal(shownAtqSplit(split), split.atq);
  assert.equal(shownAtqSplit(mixed), null);
  assert.equal(shownAtqSplit(none), null);
  assert.equal(shownAtqSplit(zeroWithLines), null);
  assert.equal(shownAtqSplit(undefined), null);
  // a row's ATQ cells: both amounts, or neither
  assert.deepEqual(atqCells({ submissions: 2n, removals: 0n }), { atqSubmissions: 2n, atqRemovals: 0n });
  assert.deepEqual(atqCells(null), {});
});

test("sorts rows by a column, a row without a value there last in either direction", () => {
  const rows: Row[] = [
    { month: "2026-02" },
    { month: "2026-10", atqSubmissions: 60000n },
    { month: "2026-08", atqSubmissions: 0n },
    { month: "2026-05" },
    { month: "2026-04", atqSubmissions: 60000n },
    { month: "2026-09", atqSubmissions: 30000n },
  ];
  const given = rows.map((r) => r.month);
  const months = (ascending: boolean) => sortRows(rows, "atqSubmissions", ascending).map((r) => r.month);
  assert.deepEqual(months(false), ["2026-10", "2026-04", "2026-09", "2026-08", "2026-02", "2026-05"]);
  assert.deepEqual(
    rows.map((r) => r.month),
    given,
    "the rows given are left in their order (the page's CSV reads them)"
  );
  assert.deepEqual(months(true), ["2026-08", "2026-09", "2026-10", "2026-04", "2026-02", "2026-05"]);
  assert.deepEqual(sortRows(rows, "month", true).map((r) => r.month), ["2026-02", "2026-04", "2026-05", "2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(rows.map((r) => r.month), given);
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
