import { useCallback, useEffect, useState } from "react";

import { IPFS_GATEWAY, STAKING_SNAPSHOTS_URL } from "consts/index";
import { fetchAllWithProgress, fetchJson, ProgressState } from "utils/fetchSnapshots";
import { hexToWei } from "utils/format";

export type StakingChain = "mainnet" | "gnosis";

export interface StakingMonthBucket {
  mainnet: Record<string, bigint>;
  gnosis: Record<string, bigint>;
}

export interface StakingData {
  months: string[]; // newest first, combined "2021-01 & 02" bucket last
  monthData: Record<string, StakingMonthBucket>;
  grandTotals: Record<string, { mainnet: bigint; gnosis: bigint }>;
}

// The very first distribution (snapshot-1.json) covered January and February 2021 combined.
const COMBINED_LABEL = "2021-01 & 02";

function monthLabel(path: string): string {
  const match = path.split("/").pop()?.match(/(\d{4}-\d{2})/);
  return match ? match[1] : COMBINED_LABEL;
}

export function compareMonths(a: string, b: string): number {
  if (a === COMBINED_LABEL) return 1;
  if (b === COMBINED_LABEL) return -1;
  return b.localeCompare(a);
}

// Shape of the merkle-drop snapshots published to IPFS by the court.
interface MerkleSnapshot {
  merkleTree?: { claims?: Record<string, { value?: { hex?: string } }> };
}

function extractClaims(data: MerkleSnapshot): Record<string, bigint> {
  const claims: Record<string, bigint> = {};
  for (const [addr, info] of Object.entries(data?.merkleTree?.claims ?? {})) {
    const amount = hexToWei(info?.value?.hex);
    if (amount > 0n) claims[addr] = amount;
  }
  return claims;
}

type SnapshotList = { [chainId: string]: string[] };

export type StakingPhase = "fetching" | "done" | "error";

export function useStakingRewards() {
  const [phase, setPhase] = useState<StakingPhase>("fetching");
  const [progress, setProgress] = useState<ProgressState>({ done: 0, total: 0, current: "", startTime: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [data, setData] = useState<StakingData | null>(null);

  const run = useCallback(async () => {
    setPhase("fetching");
    setErrors([]);
    setProgress({ done: 0, total: 0, current: "", startTime: 0 });

    // The live list published by Kleros Court; new months appear without a redeploy.
    // The response is remote input: keep only string paths and fail into the
    // error state (with Retry) on anything unusable.
    let mainnetPaths: string[];
    let gnosisPaths: string[];
    try {
      const list = (await fetchJson(STAKING_SNAPSHOTS_URL)) as SnapshotList;
      const paths = (chain: string) =>
        Array.isArray(list?.[chain]) ? list[chain].filter((p): p is string => typeof p === "string") : [];
      mainnetPaths = paths("1");
      gnosisPaths = paths("100");
      if (mainnetPaths.length + gnosisPaths.length === 0) {
        throw new Error("snapshots.json contained no snapshots");
      }
    } catch (err) {
      setErrors([`snapshot list: ${err instanceof Error ? err.message : "unknown error"}`]);
      setPhase("error");
      return;
    }
    const items = [
      ...mainnetPaths.map((path) => ({
        url: IPFS_GATEWAY + path,
        label: monthLabel(path),
        chain: "mainnet" as StakingChain,
        progressLabel: `Mainnet ${monthLabel(path)}`,
      })),
      ...gnosisPaths.map((path) => ({
        url: IPFS_GATEWAY + path,
        label: monthLabel(path),
        chain: "gnosis" as StakingChain,
        progressLabel: `Gnosis ${monthLabel(path)}`,
      })),
    ];

    const { results, errors: fetchErrors } = await fetchAllWithProgress(items, setProgress);

    const monthData: Record<string, StakingMonthBucket> = {};
    const grandTotals: Record<string, { mainnet: bigint; gnosis: bigint }> = {};

    for (const { item, data: snapshot } of results) {
      const claims = extractClaims(snapshot as MerkleSnapshot);
      if (!monthData[item.label]) monthData[item.label] = { mainnet: {}, gnosis: {} };
      const bucket = monthData[item.label][item.chain];
      for (const [addr, amount] of Object.entries(claims)) {
        bucket[addr] = (bucket[addr] ?? 0n) + amount;
        if (!grandTotals[addr]) grandTotals[addr] = { mainnet: 0n, gnosis: 0n };
        grandTotals[addr][item.chain] += amount;
      }
    }

    setErrors(fetchErrors);
    if (results.length === 0) {
      setPhase("error");
      return;
    }
    setData({
      months: Object.keys(monthData).sort(compareMonths),
      monthData,
      grandTotals,
    });
    setPhase("done");
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  return { phase, progress, errors, data, retry: run };
}
