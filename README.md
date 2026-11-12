# Kleros Rewards Dashboard

A frontend for the community to browse the rewards Kleros has distributed since inception.

Live sections:

- **Staking Rewards** — monthly PNK rewards for jurors staking in Kleros Court (Ethereum Mainnet + Gnosis, since January 2021). Ported from the standalone page in [kleros/court](https://github.com/kleros/court/blob/master/public/staking-rewards.html).
- **Curate Rewards** — monthly PNK rewards for submissions, removals and ATQ across the Address Tags, Tokens and Domains registries. Ported from [kleros/gtcr#387](https://github.com/kleros/gtcr/pull/387).
- **Proof of Humanity Rewards** — PNK airdrop claimed once per registered human in Proof of Humanity v2 (Gnosis, since January 2026), derived from the PoH v2 subgraph's `RewardClaim` entities (see [Proof-Of-Humanity/proof-of-humanity-v2-web](https://github.com/Proof-Of-Humanity/proof-of-humanity-v2-web) — the `PnkRewardDistributer` integration). Plus the stake bonus (since August 2026): 1,200 PNK more for each human who keeps at least 1,200 PNK staked in the Humanity court for six months after claiming, paid in batches outside the subgraph.
- **Agent Ambassadors** — fixed PNK rewards for AI agents' accepted content: 50 PNK per entry accepted on the Standard Curate list and 150 PNK per entry accepted on the High Quality list (Gnosis), capped per agent. Shows every entry with a preview of its post, a leaderboard, earned rewards, weekly briefs and the policy summary.

Each section lives at its program's name: `/staking`, `/curate`, `/poh` and `/agent-ambassadors`. The first three were `/staking-rewards`, `/curate-rewards` and `/poh-rewards` until November 2026, and those paths still open their page through a 301 ([netlify.toml](netlify.toml), with the same redirects in [src/App.tsx](src/App.tsx)). Keep them: links to the old paths are out there, such as the court.kleros.io homepage's link to `/staking-rewards`. The published Curate index keeps its name, `/curate-rewards.json`, because Scout reads it.

## Stack

Vite · React 18 · TypeScript · styled-components · react-router — structure and path-alias conventions modeled on [kleros-v2/web](https://github.com/kleros/kleros-v2/tree/dev/web) (without the web3/graphql machinery this app doesn't need); the light/dark palette mirrors the Kleros Curate app ([kleros/gtcr](https://github.com/kleros/gtcr) `theme-context.tsx`).

Note: `xlsx` is installed from SheetJS's official CDN tarball (their npm registry releases are stale); `yarn.lock` pins its checksum, but fresh installs need `cdn.sheetjs.com` reachable.

## Development

```bash
yarn install
yarn start        # dev server
yarn build        # typecheck + production build into dist/
yarn check-types  # typecheck only
yarn test         # unit tests (test/*.test.ts)
```

Copy `.env.example` to the gitignored `.env` and set `VITE_CURATE_INDEXER_URL` to the public Curate indexer GraphQL URL. All live Agent Ambassador profiles require it; `?data=demo` works without it. Restart the dev server after changing `.env`.

For Netlify, set `VITE_CURATE_INDEXER_URL` as a **build** environment variable for both **Production** and **Deploy Previews** before deploying this change. Vite embeds its value during the build, so changes require a new build. Keep the value in local or hosting configuration rather than tracked source; `VITE_*` variables remain visible in the browser and must not contain secrets.

## How the data works

Staking and Curate data live in JSON snapshots on IPFS; the app fetches them client-side (through `https://cdn.kleros.link/ipfs/`) and aggregates in the browser. Proof of Humanity's airdrop claims are fetched live from its subgraph on page load, and its stake bonus from snapshots like Curate's. Where each section's data comes from:

- **Staking** — fetched live from `https://court.kleros.io/snapshots.json` (merkle-drop snapshot paths per chain; `"1"` = Mainnet, `"100"` = Gnosis). New months appear automatically with no changes to this repo; if the endpoint is unreachable the page shows an error state with Retry (there is no bundled fallback).
- **Curate** — `src/assets/curate-rewards-index.json`, a checked-in list of monthly snapshot URLs produced by the curate reward calculator (`--mode document`). To pick up a newly published month, add its URL to that file — it ships in the app bundle *and* is auto-published at `/curate-rewards.json` (see below).
  ATQ rewards are shown split into **ATQ submissions** and **ATQ removals** (`src/utils/curateAtq.ts`): every ATQ line says which in its `chainName` slot, `registered` or `removed`, as `--mode document` writes it. The months amended on 2026-07-17 with aggregate lines use the same marker where the amendment said which kind a line paid, and leave it empty where it did not; a month with an unmarked line (2025-10 to 2025-12, 2026-02, 2026-05), or whose ATQ lines do not add up to its published ATQ total, shows its ATQ as one amount, "submissions + removals".
- **Proof of Humanity** — two sources, merged per wallet and per month in `src/hooks/usePohRewards.ts` (pure logic in `src/utils/pohRewards.ts`):
  - *Airdrop* — fetched live from the PoH v2 Gnosis subgraph on page load. Every payout is an immutable `RewardClaim` whose `id` is the humanityID (one claim per registered human). New claims appear automatically; if the subgraph is unreachable the page shows an error state with Retry.
  - *Stake bonus* — `src/assets/poh-stake-bonus-index.json`, a checked-in list of snapshot URLs, one per month the bonuses were earned in (`poh-stake-bonus/v1`: one line per payment, with its humanity ID, transaction, payment time and the day the six months of staking ended). The snapshots are built from the program's payout ledger by `npm run snapshot` in Proof-Of-Humanity/poh-airdrop-stake-rewards, which checks every payment against its transaction on Gnosis and says which months this index lacks or lists with other content. To publish a month, upload its file to IPFS (see [docs/adding-a-rewards-section.md](docs/adding-a-rewards-section.md), step 2) and add its URL here, replacing that month's URL if it has one. A bonus counts in the month it was earned, the month its six months ended (`windowEnd`, UTC), whenever it was paid, as Curate's rewards count in the month of the work; the drill-down shows when it was paid, linked to the transaction. So a late payment changes an already published month: its snapshot is replaced by a new one. The page reads a snapshot strictly: an amount that isn't a positive decimal wei string, a humanity ID or transaction hash that isn't one, six months that didn't end in the snapshot's month, a payment before they ended, the same payment twice, or totals that don't match the lines (the docs' hard rules) make it leave the whole file out. So does a file IPFS doesn't serve within 15 s (twice). The page then says so above the overview, with a Retry; the airdrop still shows, and a CSV exported meanwhile is named `…-partial.csv`.
- **Agent Ambassadors** — fetched live on page load from the Curate indexer configured by `VITE_CURATE_INDEXER_URL` (the one the Curate app reads): every item on the program's two Light Curate lists, with its fields (Title, Description, Link) and request history. Entry status, per-agent totals and the per-agent cap are derived client-side in `src/hooks/useAmbassadorEntries.ts`; posts on X are embedded with X's official widget, other links show as a card. Which lists are read is set by `VITE_AMBASSADOR_PROFILE` (`gnosis` by default, `sepolia` or `preview`, see `src/consts/ambassadors.ts`), and `?data=<profile>` in the URL overrides it; `?data=demo` shows bundled sample entries. Briefs are a checked-in file, `src/assets/ambassador-briefs.json` (deliberately not named `-index.json`, so it is not validated or published as a rewards index); the Briefs tab stays hidden while that file is empty.

The Curate indexer URL is a public endpoint, not an API key: Kleros [documents it as requiring no authentication](https://github.com/kleros/blockscout-kleros-api#environment-variables). Its path identifies the endpoint. If an authenticated indexer is introduced later, keep its credentials server-side; `VITE_*` variables are included in the public browser bundle and do not protect secrets.

### Public index endpoints

Every reward-program index is also published as a static file at **`/<program>.json`** so other projects can read the snapshot URLs programmatically — mirroring how [kleros/court](https://github.com/kleros/court) exposes `/snapshots.json`. The convention is automatic: any `src/assets/<program>-index.json` (the single source of truth the app imports) is validated and published at `/<program>.json` by the `viteStaticCopy` target in [vite.config.ts](vite.config.ts) — e.g. `curate-rewards-index.json` → **`/curate-rewards.json`**, `poh-stake-bonus-index.json` → **`/poh-stake-bonus.json`**. Adding a new program's manifest requires zero endpoint code: drop the file in `src/assets/` and it is served immediately, even in an already-running dev server (the glob is watched, including newly added files). In dev the file is served straight from source via middleware; in build it is copied into the dist root.

Validation (shared logic in [scripts/validate-rewards-index.ts](scripts/validate-rewards-index.ts)) fails the build on a malformed manifest: entries must be https URLs whose paths end with `<program>-YYYY-MM.json` (MM 01–12) in strictly ascending month order (which also forbids duplicates). The published copy is normalized (minified) regardless of source formatting.

Serving is configured for Netlify (Kleros's host) in [netlify.toml](netlify.toml): one wildcard CORS rule (`Access-Control-Allow-Origin: *` for `/*.json`), a revalidate-always cache policy so a new month is visible immediately, and an **unforced** SPA fallback so real manifest files are served verbatim rather than the app shell. On another host, replicate: keep the SPA catch-all from shadowing real files (safe on Netlify/Vercel by default; on Cloudflare Pages the catch-all must be ordered *below* explicit rules for the manifests), and add the CORS header.

## Adding a new rewards section

See the step-by-step guide in [docs/adding-a-rewards-section.md](docs/adding-a-rewards-section.md) — it covers structuring the snapshot JSONs (with a validation script), uploading them to IPFS via Kleros' Filebase, publishing the index, and wiring up the hook, page, route, and home card. Short version:

1. One JSON snapshot per period on IPFS (amounts as decimal wei strings; totals must equal the sum of per-recipient lines; lowercase address keys) + an index of URLs (bundled under `src/assets/` or served live with CORS). Name a bundled index `src/assets/<program>-index.json` and it is automatically validated and exposed at `/<program>.json` — no endpoint code.
2. Write a hook in `src/hooks/` that fetches and aggregates it (copy `useCurateRewards`; `fetchAllWithProgress` handles concurrency, retries and progress).
3. Add a page in `src/pages/` reusing `RewardsTable`, `Tabs`, `StatsRow`, `FetchProgress`.
4. Register the route in `src/App.tsx`, add a card in `src/pages/Home.tsx`, and a nav link in `src/components/Layout.tsx`.
