import type { CurateSnapshot, RewardLine } from "hooks/useCurateRewards";
import { toWei } from "utils/format";

// ATQ rewards pay for two things: a module submitted to (registered in) the
// ATQ registry, or one removed from it, each from its own pool. A reward line
// says which in its chainName slot, "registered" or "removed" — the slot the
// calculator writes it to (tag-registry-rewards, src/utils/curate-document.ts).
// The months before itemized ATQ (2024-10 to 2026-05) were amended on
// 2026-07-17 with one aggregate line per recipient, marked the same way when
// that recipient's ATQ that month was all of one kind, and left empty when it
// was mixed: those amounts cannot be split.
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

// Each recipient's ATQ split for a month, keyed as the snapshot keys them —
// or null when the month cannot be split: a line that does not say its kind,
// or lines that do not add up to the published ATQ total to the wei (so a
// split never shows amounts that disagree with the month's ATQ figure).
export function splitAtqByRecipient(snapshot: CurateSnapshot): Record<string, AtqSplit> | null {
  const byRecipient: Record<string, AtqSplit> = {};
  let sum = 0n;
  for (const [addr, recipient] of Object.entries(snapshot.recipients ?? {})) {
    const split = splitAtqLines(recipient.atq);
    if (split === null) return null;
    byRecipient[addr] = split;
    sum += split.submissions + split.removals;
  }
  return sum === toWei(snapshot.totals?.atq) ? byRecipient : null;
}

// A month's ATQ split, or null when it cannot be split (see above).
export function splitAtq(snapshot: CurateSnapshot): AtqSplit | null {
  const byRecipient = splitAtqByRecipient(snapshot);
  if (byRecipient === null) return null;
  const total: AtqSplit = { submissions: 0n, removals: 0n };
  for (const split of Object.values(byRecipient)) {
    total.submissions += split.submissions;
    total.removals += split.removals;
  }
  return total;
}
