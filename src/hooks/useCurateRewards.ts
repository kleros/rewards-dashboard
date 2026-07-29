import { useCallback, useEffect, useState } from "react";

import curateIndex from "assets/curate-rewards-index.json";
import { fetchAllWithProgress, ProgressState } from "utils/fetchSnapshots";
import { toWei } from "utils/format";

// Shapes of the curate-rewards snapshots produced by the reward calculator
// (see kleros/gtcr#387). Amounts are decimal wei strings.
export interface RewardLine {
  amount?: string;
  registry?: string;
  chain?: string;
  chainName?: string;
  tagAddress?: string;
}

export interface CurateRecipient {
  submissions?: RewardLine[];
  removals?: RewardLine[];
  atq?: RewardLine[];
  total?: string;
}

// Number of rewarded entries per category, published in amended snapshots
// (2026-07-20). null = not recoverable from the tracking records.
export interface CurateEntryCounts {
  submissions?: number | null;
  removals?: number | null;
  atq?: number | null;
  total?: number | null;
}

export interface CurateSnapshot {
  period?: { label?: string };
  totals?: { submissions?: string; removals?: string; atq?: string; total?: string };
  entryCounts?: CurateEntryCounts;
  recipients?: Record<string, CurateRecipient>;
}

export interface CuratePeriod {
  label: string;
  snapshot: CurateSnapshot;
}

export interface CurateTotals {
  submissions: bigint;
  removals: bigint;
  atq: bigint;
  total: bigint;
}

export interface CurateData {
  periods: CuratePeriod[]; // newest first
  grandTotals: Record<string, CurateTotals>;
}

export const sumLines = (lines: RewardLine[] | undefined): bigint =>
  (lines ?? []).reduce((total, line) => total + toWei(line.amount), 0n);

// Prefer the published entryCounts (amended snapshots, 2026-07-20). For
// snapshots without it, fall back to counting itemized reward lines — but
// aggregate lump lines (empty registry/tagAddress) are not entries, so any
// snapshot containing one reports null rather than a misleading line count.
export function countEntries(
  snapshot: CurateSnapshot,
  category: "total" | "submissions" | "removals" = "total"
): number | null {
  const published = snapshot.entryCounts?.[category];
  if (typeof published === "number" && Number.isFinite(published)) return published;
  if (snapshot.entryCounts) return null;
  let count = 0;
  for (const recipient of Object.values(snapshot.recipients ?? {})) {
    const categories =
      category === "total"
        ? [recipient.submissions, recipient.removals, recipient.atq]
        : category === "submissions"
          ? [recipient.submissions]
          : [recipient.removals];
    for (const lines of categories) {
      for (const line of lines ?? []) {
        if (!line.registry && !line.tagAddress) return null;
        count++;
      }
    }
  }
  return count;
}

export function avgWei(total: bigint, count: number | null): bigint | null {
  return count && count > 0 ? total / BigInt(count) : null;
}

// Total rewarded entries with partial knowledge: the published total sums
// submissions + removals + atq, and a month whose ATQ payment is an aggregate
// lump (2024-10) publishes atq/total as null while its submission and removal
// counts are known — the sum of the known categories is then a floor, not an
// unknown. exact=false marks such floors (rendered with a trailing "+").
export interface EntryTotal {
  value: number;
  exact: boolean;
}

export function countTotalEntries(snapshot: CurateSnapshot): EntryTotal | null {
  const counts = snapshot.entryCounts;
  if (counts) {
    if (typeof counts.total === "number" && Number.isFinite(counts.total)) {
      return { value: counts.total, exact: true };
    }
    const parts = [counts.submissions, counts.removals, counts.atq];
    const known = parts.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    // A floor is only meaningful with the dominant category (submissions) known;
    // it is exact when every category is known.
    if (typeof counts.submissions === "number" && Number.isFinite(counts.submissions)) {
      return { value: known.reduce((a, b) => a + b, 0), exact: known.length === parts.length };
    }
    return null;
  }
  const counted = countEntries(snapshot, "total");
  return counted === null ? null : { value: counted, exact: true };
}

function labelFor(url: string, snapshot: CurateSnapshot): string {
  if (snapshot.period?.label) return snapshot.period.label;
  const match = url.match(/(\d{4}-\d{2})/);
  return match ? match[1] : url.split("/").pop() ?? url;
}

export type CuratePhase = "fetching" | "done" | "error";

export function useCurateRewards() {
  const [phase, setPhase] = useState<CuratePhase>("fetching");
  const [progress, setProgress] = useState<ProgressState>({ done: 0, total: 0, current: "", startTime: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [data, setData] = useState<CurateData | null>(null);

  const run = useCallback(async () => {
    setPhase("fetching");
    setErrors([]);

    const items = curateIndex.map((url) => ({
      url,
      progressLabel: url.match(/(\d{4}-\d{2})/)?.[1] ?? url.split("/").pop() ?? url,
    }));

    const { results, errors: fetchErrors } = await fetchAllWithProgress(items, setProgress);

    // Snapshots are remote input: skip anything that isn't an object, and never
    // let an aggregation surprise reject run() unhandled (that would strand the
    // page on the spinner with no Retry).
    try {
      const periods: CuratePeriod[] = results
        .filter(({ data: raw }) => typeof raw === "object" && raw !== null)
        .map(({ item, data: raw }) => {
          const snapshot = raw as CurateSnapshot;
          return { label: labelFor(item.url, snapshot), snapshot };
        })
        .sort((a, b) => (a.label < b.label ? 1 : -1));

      const grandTotals: Record<string, CurateTotals> = {};
      for (const { snapshot } of periods) {
        for (const [addr, recipient] of Object.entries(snapshot.recipients ?? {})) {
          const key = addr.toLowerCase();
          const grand = grandTotals[key] ?? { submissions: 0n, removals: 0n, atq: 0n, total: 0n };
          const submissions = sumLines(recipient.submissions);
          const removals = sumLines(recipient.removals);
          const atq = sumLines(recipient.atq);
          grand.submissions += submissions;
          grand.removals += removals;
          grand.atq += atq;
          grand.total += submissions + removals + atq;
          grandTotals[key] = grand;
        }
      }

      setErrors(fetchErrors);
      if (periods.length === 0) {
        setPhase("error");
        return;
      }
      setData({ periods, grandTotals });
      setPhase("done");
    } catch (err) {
      setErrors([...fetchErrors, `aggregation failed: ${err instanceof Error ? err.message : "unknown error"}`]);
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  return { phase, progress, errors, data, retry: run };
}
