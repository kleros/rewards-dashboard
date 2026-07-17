export const IPFS_GATEWAY = "https://cdn.kleros.link/ipfs/";
// Live snapshot list published by Kleros Court (same file the court's own
// staking-rewards page uses). There is no bundled fallback: if this endpoint
// is unreachable the Staking page shows its error state with a Retry button.
export const STAKING_SNAPSHOTS_URL = "https://court.kleros.io/snapshots.json";
export const PAGE_SIZE = 100;
export const FETCH_CONCURRENCY = 5;
export const WEI = 10n ** 18n;
