import type { CuratePeriod, CurateSnapshot, RewardLine } from "hooks/useCurateRewards";
import { toWei } from "utils/format";

// ATQ rewards pay for two things: a module submitted to (registered in) the
// ATQ registry, or one removed from it, each from its own pool. A reward line
// says which in its chainName slot, "registered" or "removed" — the slot the
// calculator writes it to (tag-registry-rewards, src/utils/curate-document.ts).
// The months before itemized ATQ (2024-10 to 2026-05) were amended on
// 2026-07-17 with aggregate lines, marked the same way where the amendment
// said which kind they paid, and left empty where it did not (in 2025-12 even
// recipients of one kind were left empty). An unmarked amount cannot be split:
// it may be submissions, removals or both.
export type AtqKind = "submission" | "removal";

export function atqKind(line: RewardLine): AtqKind | null {
  if (line.chainName === "registered") return "submission";
  if (line.chainName === "removed") return "removal";
  return null;
}

export interface AtqSplit {
  submissions: bigint;
  removals: bigint;
}

// A month's ATQ split, in total and by recipient (keyed as the snapshot keys
// them).
export interface AtqBreakdown {
  total: AtqSplit;
  byRecipient: Record<string, AtqSplit>;
}

// The ATQ lines' amounts by kind, or null when any line does not say its kind.
export function splitAtqLines(lines: RewardLine[] | undefined): AtqSplit | null {
  let submissions = 0n;
  let removals = 0n;
  for (const line of lines ?? []) {
    const kind = atqKind(line);
    if (kind === null) return null;
    if (kind === "submission") submissions += toWei(line.amount);
    else removals += toWei(line.amount);
  }
  return { submissions, removals };
}

// Splits added up, or null when any of them is (it cannot be split then).
export function sumAtqSplits(splits: (AtqSplit | null)[]): AtqSplit | null {
  const total: AtqSplit = { submissions: 0n, removals: 0n };
  for (const split of splits) {
    if (split === null) return null;
    total.submissions += split.submissions;
    total.removals += split.removals;
  }
  return total;
}

// A month's ATQ split, or null when the month cannot be split: a line that
// does not say its kind, or lines that do not add up to the published ATQ
// total to the wei (so a split never disagrees with the month's ATQ figure).
export function breakDownAtq(snapshot: CurateSnapshot): AtqBreakdown | null {
  const byRecipient: Record<string, AtqSplit> = {};
  for (const [addr, recipient] of Object.entries(snapshot.recipients ?? {})) {
    const split = splitAtqLines(recipient?.atq);
    if (split === null) return null;
    byRecipient[addr] = split;
  }
  const total = sumAtqSplits(Object.values(byRecipient)) as AtqSplit;
  return total.submissions + total.removals === toWei(snapshot.totals?.atq) ? { total, byRecipient } : null;
}

const NO_ATQ: AtqSplit = { submissions: 0n, removals: 0n };

// What a month contributes to an ATQ split shown for it or added across
// months. A month whose published ATQ is 0 has none of either, whatever its
// lines say (as its ATQ figure is 0); otherwise its split, or null.
export function monthAtqSplit(period: Pick<CuratePeriod, "snapshot" | "atq">): AtqSplit | null {
  if (toWei(period.snapshot.totals?.atq) === 0n) return NO_ATQ;
  return period.atq?.total ?? null;
}

// Every month's ATQ split, added up; null when any month's cannot be split.
export function allTimeAtqSplit(periods: Pick<CuratePeriod, "snapshot" | "atq">[]): AtqSplit | null {
  return sumAtqSplits(periods.map(monthAtqSplit));
}

// The one rule for showing a month's ATQ split, in its stat cards and its
// recipient columns alike: when it can be split and the month has ATQ at all
// (a month without ATQ keeps one ATQ card and column).
export function shownAtqSplit(period: Pick<CuratePeriod, "snapshot" | "atq"> | undefined): AtqBreakdown | null {
  return period?.atq && toWei(period.snapshot.totals?.atq) > 0n ? period.atq : null;
}

// A row's ATQ cells: both amounts of its split, or neither when there is none
// (the row's ATQ is then shown as one amount across both columns, and sorts
// last by either).
export function atqCells(split: AtqSplit | null): { atqSubmissions?: bigint; atqRemovals?: bigint } {
  return split ? { atqSubmissions: split.submissions, atqRemovals: split.removals } : {};
}
