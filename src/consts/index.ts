export const IPFS_GATEWAY = "https://cdn.kleros.link/ipfs/";
// Live snapshot list published by Kleros Court (same file the court's own
// staking-rewards page uses). There is no bundled fallback: if this endpoint
// is unreachable the Staking page shows its error state with a Retry button.
export const STAKING_SNAPSHOTS_URL = "https://court.kleros.io/snapshots.json";
export const PAGE_SIZE = 100;
// PNK total supply, used to contextualize all-time distributions. Matches the
// on-chain totalSupply() of PNK (0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73BC04d
// on Ethereum mainnet), verified 2026-07-29: 915,528,222 PNK.
export const PNK_TOTAL_SUPPLY = 915_528_222n * 10n ** 18n;
export const FETCH_CONCURRENCY = 5;
export const WEI = 10n ** 18n;
