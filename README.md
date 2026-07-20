# Kleros Rewards Dashboard

A frontend for the community to browse the rewards Kleros has distributed since inception.

Live sections:

- **Staking Rewards** — monthly PNK rewards for jurors staking in Kleros Court (Ethereum Mainnet + Gnosis, since January 2021). Ported from the standalone page in [kleros/court](https://github.com/kleros/court/blob/master/public/staking-rewards.html).
- **Curate Rewards** — monthly PNK rewards for submissions, removals and ATQ across the Address Tags, Tokens and Domains registries. Ported from [kleros/gtcr#387](https://github.com/kleros/gtcr/pull/387).
- **Proof of Humanity Rewards** — PNK airdrop claimed once per registered human in Proof of Humanity v2 (Gnosis, since January 2026). Derived from the PoH v2 subgraph's `RewardClaim` entities (see [Proof-Of-Humanity/proof-of-humanity-v2-web](https://github.com/Proof-Of-Humanity/proof-of-humanity-v2-web) — the `PnkRewardDistributer` integration).

## Stack

Vite · React 18 · TypeScript · styled-components · react-router — structure and path-alias conventions modeled on [kleros-v2/web](https://github.com/kleros/kleros-v2/tree/dev/web) (without the web3/graphql machinery this app doesn't need); the light/dark palette mirrors the Kleros Curate app ([kleros/gtcr](https://github.com/kleros/gtcr) `theme-context.tsx`).

Note: `xlsx` is installed from SheetJS's official CDN tarball (their npm registry releases are stale); `yarn.lock` pins its checksum, but fresh installs need `cdn.sheetjs.com` reachable.

## Development

```bash
yarn install
yarn start        # dev server
yarn build        # typecheck + production build into dist/
yarn check-types  # typecheck only
```

## How the data works

Staking and Curate data live in JSON snapshots on IPFS; the app fetches them client-side (through `https://cdn.kleros.link/ipfs/`) and aggregates in the browser. Proof of Humanity needs no snapshots at all — it is fetched live from its subgraph on page load. Where each section's data comes from:

- **Staking** — fetched live from `https://court.kleros.io/snapshots.json` (merkle-drop snapshot paths per chain; `"1"` = Mainnet, `"100"` = Gnosis). New months appear automatically with no changes to this repo; if the endpoint is unreachable the page shows an error state with Retry (there is no bundled fallback).
- **Curate** — `src/assets/curate-rewards-index.json`, a checked-in list of monthly snapshot URLs produced by the curate reward calculator (`--mode document`). To pick up a newly published month, add its URL to that file — it ships in the app bundle *and* is auto-published at `/curate-rewards.json` (see below).
- **Proof of Humanity** — fetched live from the PoH v2 Gnosis subgraph on page load. Every payout is an immutable `RewardClaim` whose `id` is the humanityID (one claim per registered human), monthly tables are aggregated client-side in `src/hooks/usePohRewards.ts`. No snapshot files, index, or pinning: new claims appear automatically; if the subgraph is unreachable the page shows an error state with Retry.

### Public index endpoints

Every reward-program index is also published as a static file at **`/<program>.json`** so other projects can read the snapshot URLs programmatically — mirroring how [kleros/court](https://github.com/kleros/court) exposes `/snapshots.json`. The convention is automatic: any `src/assets/<program>-index.json` (the single source of truth the app imports) is validated and published at `/<program>.json` by the `viteStaticCopy` target in [vite.config.ts](vite.config.ts) — e.g. `curate-rewards-index.json` → **`/curate-rewards.json`**. Adding a new program's manifest requires zero endpoint code: drop the file in `src/assets/` and it is served immediately, even in an already-running dev server (the glob is watched, including newly added files). In dev the file is served straight from source via middleware; in build it is copied into the dist root.

Validation (shared logic in [scripts/validate-rewards-index.ts](scripts/validate-rewards-index.ts)) fails the build on a malformed manifest: entries must be https URLs whose paths end with `<program>-YYYY-MM.json` (MM 01–12) in strictly ascending month order (which also forbids duplicates). The published copy is normalized (minified) regardless of source formatting.

Serving is configured for Netlify (Kleros's host) in [netlify.toml](netlify.toml): one wildcard CORS rule (`Access-Control-Allow-Origin: *` for `/*.json`), a revalidate-always cache policy so a new month is visible immediately, and an **unforced** SPA fallback so real manifest files are served verbatim rather than the app shell. On another host, replicate: keep the SPA catch-all from shadowing real files (safe on Netlify/Vercel by default; on Cloudflare Pages the catch-all must be ordered *below* explicit rules for the manifests), and add the CORS header.

## Adding a new rewards section

See the step-by-step guide in [docs/adding-a-rewards-section.md](docs/adding-a-rewards-section.md) — it covers structuring the snapshot JSONs (with a validation script), uploading them to IPFS via Kleros' Filebase, publishing the index, and wiring up the hook, page, route, and home card. Short version:

1. One JSON snapshot per period on IPFS (amounts as decimal wei strings; totals must equal the sum of per-recipient lines; lowercase address keys) + an index of URLs (bundled under `src/assets/` or served live with CORS). Name a bundled index `src/assets/<program>-index.json` and it is automatically validated and exposed at `/<program>.json` — no endpoint code.
2. Write a hook in `src/hooks/` that fetches and aggregates it (copy `useCurateRewards`; `fetchAllWithProgress` handles concurrency, retries and progress).
3. Add a page in `src/pages/` reusing `RewardsTable`, `Tabs`, `StatsRow`, `FetchProgress`.
4. Register the route in `src/App.tsx`, add a card in `src/pages/Home.tsx`, and a nav link in `src/components/Layout.tsx`.
