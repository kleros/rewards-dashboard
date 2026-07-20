import { useCallback, useEffect, useState } from "react";

import { ProgressState } from "utils/fetchSnapshots";
import { toWei } from "utils/format";

// Live data source: the Proof of Humanity v2 Gnosis subgraph. Every payout of
// the fixed PNK airdrop is indexed as an immutable `RewardClaim` whose `id` is
// the humanityID (one claim per registered human), so the whole history is
// small and cheap to fetch straight from the subgraph on page load — no
// snapshot files or IPFS pinning. The gateway URL embeds an API key, so it is
// read from an env var rather than hard-coded (see .env.example).
const SUBGRAPH_URL: string | undefined = import.meta.env.VITE_GNOSIS_SUBGRAPH_URL;

// The Graph caps the `first` argument at 1000 rows per request, so this is both
// the page size and the largest page we can ever ask for.
const MAX_PAGE_SIZE = 1000;

// Retry transient network/subgraph failures a few times before giving up.
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 1000;

// One wallet's airdrop reward.
export interface PohReward {
  address: string; // lowercased claimer wallet
  humanityId: string;
  amount: bigint;
  claimedAt: string; // ISO 8601
}

// One month of the program, newest-first in PohData.months.
export interface PohMonth {
  label: string; // YYYY-MM
  total: bigint;
  recipients: PohReward[];
}

export interface PohData {
  months: PohMonth[]; // newest first
  recipients: PohReward[]; // all-time, one per wallet
}

// One reward-claim row as returned by the subgraph. `id` is the humanityID;
// `claimer.id` is the wallet that received the PNK; `amount` is a wei string.
interface RawClaim {
  id: string;
  amount: string;
  timestamp: string;
  claimer: { id: string };
}

const CLAIMS_QUERY = `query Claims($lastId: ID!, $first: Int!) {
  rewardClaims(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId }) {
    id
    amount
    timestamp
    claimer { id }
  }
}`;

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// POST a GraphQL query to the subgraph, retrying transient failures with a
// linear backoff. Throws (rather than returning partial data) so the caller can
// show the error state with a Retry.
async function querySubgraph<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  if (!SUBGRAPH_URL) {
    throw new Error("VITE_GNOSIS_SUBGRAPH_URL is not set");
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
// primary key with a deterministic byte-lexicographic order, so `id_gt` paging
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

function toMonthLabel(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0"); // getUTCMonth is 0-based
  return `${year}-${month}`;
}

// Turn the flat claim list into one reward per wallet, grouped by month.
function aggregate(rawClaims: RawClaim[]): PohData {
  const recipients: PohReward[] = [];
  const byMonth = new Map<string, PohReward[]>();

  for (const rawClaim of rawClaims) {
    const reward: PohReward = {
      address: rawClaim.claimer.id.toLowerCase(),
      humanityId: rawClaim.id,
      amount: toWei(rawClaim.amount),
      claimedAt: new Date(Number(rawClaim.timestamp) * 1000).toISOString(),
    };
    recipients.push(reward);

    const label = toMonthLabel(Number(rawClaim.timestamp));
    const bucket = byMonth.get(label) ?? [];
    bucket.push(reward);
    byMonth.set(label, bucket);
  }

  const months: PohMonth[] = [...byMonth.entries()]
    .map(([label, monthRewards]) => ({
      label,
      total: monthRewards.reduce((sum, reward) => sum + reward.amount, 0n),
      recipients: monthRewards,
    }))
    .sort((a, b) => (a.label < b.label ? 1 : -1));

  return { months, recipients };
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
      const claims = await fetchAllClaims(setProgress, startTime);
      const aggregated = aggregate(claims);

      if (aggregated.months.length === 0) {
        setErrors(["subgraph returned no reward claims"]);
        setPhase("error");
        return;
      }
      setData(aggregated);
      setPhase("done");
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "unknown error"]);
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  return { phase, progress, errors, data, retry: run };
}
