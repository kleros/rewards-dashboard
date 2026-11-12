import { useCallback, useEffect, useState } from "react";

import stakeBonusIndex from "assets/poh-stake-bonus-index.json";
import { fetchAllWithProgress, ProgressState } from "utils/fetchSnapshots";
import { PohData, PohReward, RawClaim, aggregate, bonusRewards, claimReward, snapshotMonth } from "utils/pohRewards";

export type { PohData, PohKind, PohMonth, PohReward, PohWallet } from "utils/pohRewards";

// Two sources. The airdrop is read live from the Proof of Humanity v2 Gnosis
// subgraph: every payout of the fixed PNK airdrop is indexed as an immutable
// `RewardClaim` whose `id` is the humanityID (one claim per registered human),
// so the whole history is small and cheap to fetch on page load. The stake
// bonus is paid outside the subgraph, so it comes from monthly snapshots on
// IPFS, listed in src/assets/poh-stake-bonus-index.json.
const SUBGRAPH_URL: string | undefined = import.meta.env.VITE_POH_GNOSIS_SUBGRAPH_URL;

const MAX_PAGE_SIZE = 1000;

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 1000;

const CLAIMS_QUERY = `query Claims($lastId: ID!, $first: Int!) {
  rewardClaims(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId }) {
    id
    amount
    timestamp
    claimer { id }
  }
}`;

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));


async function querySubgraph<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  if (!SUBGRAPH_URL) {
    throw new Error("VITE_POH_GNOSIS_SUBGRAPH_URL is not set");
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const body = (await response.json()) as { data?: T; errors?: { message?: string }[] };
      if (body.errors?.length) throw new Error(body.errors[0]?.message ?? "GraphQL error");
      if (!body.data) throw new Error("empty GraphQL response");
      return body.data;
    } catch (error) {
      lastError = error;
      const isFinalAttempt = attempt === MAX_ATTEMPTS;
      if (!isFinalAttempt) await delay(RETRY_BACKOFF_MS * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("subgraph request failed");
}

// Fetch every reward claim by paging through the subgraph. We cursor on `id`
// (the humanityID) rather than a numeric `skip` offset: `id` is the unique
// primary key with a deterministic and lexicographic order, so `id_gt` paging
// can never skip or double-count a row even while new claims are still being
// indexed — and it has no upper bound, whereas `skip` breaks past 5000 rows.
async function fetchAllClaims(
  reportProgress: (progress: ProgressState) => void,
  startTime: number
): Promise<RawClaim[]> {
  const allClaims: RawClaim[] = [];

  let lastSeenId = "";
  let pageWasFull = true;

  while (pageWasFull) {
    const { rewardClaims } = await querySubgraph<{ rewardClaims: RawClaim[] }>(CLAIMS_QUERY, {
      lastId: lastSeenId,
      first: MAX_PAGE_SIZE,
    });
    allClaims.push(...rewardClaims);

    // A full page means there is probably another page; a short page is the last.
    pageWasFull = rewardClaims.length === MAX_PAGE_SIZE;

    reportProgress({
      done: allClaims.length,
      total: allClaims.length + (pageWasFull ? MAX_PAGE_SIZE : 0),
      current: `${allClaims.length.toLocaleString()} reward claims`,
      startTime,
    });

    if (pageWasFull) lastSeenId = rewardClaims[rewardClaims.length - 1].id;
  }

  return allClaims;
}

const message = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

// The page waits for the stake bonus with the airdrop, so a snapshot IPFS
// doesn't serve must not hold the airdrop back: each attempt gets this long
// (two attempts), then the snapshot is reported as missing.
const BONUS_TIMEOUT_MS = 15_000;

// Every stake bonus payment in the published snapshots. A snapshot that fails
// to load or can't be trusted is left out and reported, and the page says its
// totals lack it: the airdrop still shows, so this never throws.
async function fetchBonusRewards(): Promise<{ rewards: PohReward[]; snapshots: number; errors: string[] }> {
  try {
    const items = stakeBonusIndex.map((url) => ({ url, progressLabel: snapshotMonth(url) ?? url }));
    const { results, errors } = await fetchAllWithProgress(items, () => undefined, {
      retries: 2,
      timeoutMs: BONUS_TIMEOUT_MS,
    });
    const rewards: PohReward[] = [];
    let snapshots = 0;
    for (const { item, data } of results) {
      try {
        rewards.push(...bonusRewards(item.url, data));
        snapshots++;
      } catch (error) {
        errors.push(`${item.progressLabel}: ${message(error)}`);
      }
    }
    return { rewards, snapshots, errors: errors.map((error) => `Stake bonus ${error}`) };
  } catch (error) {
    return { rewards: [], snapshots: 0, errors: [`Stake bonus: ${message(error)}`] };
  }
}

export type PohPhase = "fetching" | "done" | "error";

export function usePohRewards() {
  const [phase, setPhase] = useState<PohPhase>("fetching");
  const [progress, setProgress] = useState<ProgressState>({ done: 0, total: 0, current: "", startTime: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [data, setData] = useState<PohData | null>(null);

  const run = useCallback(async () => {
    setPhase("fetching");
    setErrors([]);
    const startTime = Date.now();
    setProgress({ done: 0, total: MAX_PAGE_SIZE, current: "Querying Proof of Humanity subgraph…", startTime });

    try {
      const bonusFetch = fetchBonusRewards();
      const claims = await fetchAllClaims(setProgress, startTime);
      setProgress((last) => ({ ...last, current: "Stake bonus snapshots from IPFS…" }));
      const bonus = await bonusFetch;
      // Bonuses first: tables sort by total, and in a month's table a bonus
      // ties with the claims around it, so the stable sort lists it first.
      const aggregated = aggregate([...bonus.rewards, ...claims.map(claimReward)], bonus.snapshots);

      if (!aggregated.months.some((month) => month.claims > 0)) {
        setErrors(["subgraph returned no reward claims"]);
        setPhase("error");
        return;
      }
      setErrors(bonus.errors);
      setData(aggregated);
      setPhase("done");
    } catch (error) {
      setErrors([message(error)]);
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  return { phase, progress, errors, data, retry: run };
}
