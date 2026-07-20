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
