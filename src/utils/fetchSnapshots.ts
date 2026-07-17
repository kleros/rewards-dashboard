import { FETCH_CONCURRENCY } from "consts/index";

export interface ProgressState {
  done: number;
  total: number;
  current: string;
  startTime: number;
}

export async function fetchJson(url: string, retries = 3): Promise<unknown> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

interface FetchItem {
  url: string;
  progressLabel: string;
}

// Fetch every item's JSON with limited concurrency, reporting progress as we go.
// Failures don't abort the run; they come back in `errors`.
export async function fetchAllWithProgress<T extends FetchItem>(
  items: T[],
  onProgress: (progress: ProgressState) => void
): Promise<{ results: { item: T; data: unknown }[]; errors: string[] }> {
  const total = items.length;
  const startTime = Date.now();
  onProgress({ done: 0, total, current: "Starting...", startTime });

  const results: { item: T; data: unknown }[] = [];
  const errors: string[] = [];

  for (let i = 0; i < total; i += FETCH_CONCURRENCY) {
    const batch = items.slice(i, i + FETCH_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (item) => {
        onProgress({ done: Math.min(i, total), total, current: item.progressLabel, startTime });
        return { item, data: await fetchJson(item.url) };
      })
    );
    settled.forEach((result, j) => {
      if (result.status === "fulfilled") results.push(result.value);
      else errors.push(`${batch[j].progressLabel}: ${result.reason?.message ?? "unknown error"}`);
    });
    onProgress({ done: Math.min(i + FETCH_CONCURRENCY, total), total, current: "", startTime });
  }

  return { results, errors };
}
