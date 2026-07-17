# Kleros Rewards Dashboard

A frontend for the community to browse the rewards Kleros has distributed since inception.

Live sections:

- **Staking Rewards** — monthly PNK rewards for jurors staking in Kleros Court (Ethereum Mainnet + Gnosis, since January 2021). Ported from the standalone page in [kleros/court](https://github.com/kleros/court/blob/master/public/staking-rewards.html).
- **Curate Rewards** — monthly PNK rewards for submissions, removals and ATQ across the Address Tags, Tokens and Domains registries. Ported from [kleros/gtcr#387](https://github.com/kleros/gtcr/pull/387).

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

All reward data lives in JSON snapshots on IPFS; the app fetches them client-side (through `https://cdn.kleros.link/ipfs/`) and aggregates in the browser. Where the snapshot lists come from:

- **Staking** — fetched live from `https://court.kleros.io/snapshots.json` (merkle-drop snapshot paths per chain; `"1"` = Mainnet, `"100"` = Gnosis). New months appear automatically with no changes to this repo; if the endpoint is unreachable the page shows an error state with Retry (there is no bundled fallback).
- **Curate** — `src/assets/curate-rewards-index.json`, a checked-in list of monthly snapshot URLs produced by the curate reward calculator (`--mode document`). To pick up a newly published month, add its URL to that file.

## Adding a new rewards section

See the step-by-step guide in [docs/adding-a-rewards-section.md](docs/adding-a-rewards-section.md) — it covers structuring the snapshot JSONs (with a validation script), uploading them to IPFS via Kleros' Filebase, publishing the index, and wiring up the hook, page, route, and home card. Short version:

1. One JSON snapshot per period on IPFS (amounts as decimal wei strings; totals must equal the sum of per-recipient lines; lowercase address keys) + an index of URLs (bundled under `src/assets/` or served live with CORS).
2. Write a hook in `src/hooks/` that fetches and aggregates it (copy `useCurateRewards`; `fetchAllWithProgress` handles concurrency, retries and progress).
3. Add a page in `src/pages/` reusing `RewardsTable`, `Tabs`, `StatsRow`, `FetchProgress`.
4. Register the route in `src/App.tsx`, add a card in `src/pages/Home.tsx`, and a nav link in `src/components/Layout.tsx`.
