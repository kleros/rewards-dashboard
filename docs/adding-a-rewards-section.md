# Adding a new rewards section

This guide walks through adding a new reward program to the dashboard end to end — from raw reward data to a live page. The running example is a hypothetical **Proof of Humanity V2 Rewards** section; substitute your program's name throughout.

The dashboard has no backend. Every section follows the same architecture:

```
snapshot JSONs on IPFS  ←  one file per period (month), immutable
        ▲
   index (list of URLs) ←  bundled in this repo, or served live by your project
        ▲
   src/hooks/usePohRewards.ts  ←  fetches + aggregates client-side (bigint wei)
        ▲
   src/pages/PohRewards.tsx    ←  tabs + tables built from shared components
        ▲
   route in App.tsx + card on Home.tsx + link in Layout.tsx
```

Existing sections to crib from: **Curate** (bundled index → per-recipient snapshots; the closest template for most programs) and **Staking** (live index endpoint → merkle-drop snapshots).

---

## Step 1 — Structure your reward data

Produce **one JSON file per reward period** (usually a calendar month). Unless your data already has an established format (like the staking merkle drops), follow the `curate-rewards/v1` shape — the dashboard's table/detail components map onto it directly:

```jsonc
{
  "schema": "poh-rewards/v1",
  "period": {
    "label": "2026-07",                          // YYYY-MM, must match the filename
    "start": "2026-07-01T00:00:00.000Z",
    "end":   "2026-08-01T00:00:00.000Z"
  },
  "generatedAt": "2026-08-03T12:00:00.000Z",
  "chainId": 100,                                 // chain the rewards were paid on
  "token": { "symbol": "PNK", "address": "0xcb3231aBA3b451343e0Fddfc45883c842f223846" },
  "totals": {
    "vouching": "12000000000000000000000",        // one key per reward category,
    "disputes": "3500000000000000000000",         // amounts in DECIMAL WEI STRINGS
    "total":    "15500000000000000000000",
    "recipientCount": 2
  },
  "recipients": {
    "0xabc…def": {                                // LOWERCASE address keys
      "total": "10000000000000000000000",
      "vouching": [                               // one array per category; itemized lines
        {
          "registry": "poh",                      // free-form context fields shown in the
          "chain": "",                            // wallet drill-down — fill what you have,
          "chainName": "Gnosis Chain",            // empty strings are fine
          "tagAddress": "0x…itemId…",
          "amount": "10000000000000000000000"
        }
      ],
      "disputes": []
    }
    // …second recipient (5,500 PNK: 2,000 vouching + 3,500 disputes) omitted for
    // brevity — in a real file, recipients must account for every wei in totals.
  },
  "note": "optional free text shown to future maintainers"
}
```

**Hard rules — these are what past audits caught violations of, so treat them as invariants:**

1. **Amounts are decimal wei strings** (`"1500000000000000000000"`, never floats, never scientific notation, never hex). Floats lose precision; the frontend parses with `BigInt`.
2. **`totals.<category>` must equal the sum of every recipient's lines in that category, to the wei.** The historical Curate files violated this for ATQ (totals said 66,660 PNK, no recipient had a single ATQ line) and it took a forensic on-chain reconstruction to repair. If a category can't be itemized per recipient yet, *don't publish the period* until it can — a total with no attribution is a debt someone else pays later.
3. **`recipients` keys are lowercase `0x…` addresses.** The frontend lowercases on click-through lookup.
4. **`recipient.total` = sum of that recipient's lines**, and `totals.recipientCount` = number of keys in `recipients`.
5. **`period.label` matches the filename** (`poh-rewards-2026-07.json` → `"2026-07"`). The frontend derives tab names from labels.
6. Snapshots are **immutable once published** — to correct one, upload a fixed file (new CID) and swap the URL in the index. Never assume you can edit in place.

Validate before uploading. A 20-line script that re-sums every array and compares against `totals` is the single highest-value check — run it on every file, every time:

```js
// validate.mjs — node validate.mjs poh-rewards-2026-07.json
import { readFileSync } from "fs";
const s = JSON.parse(readFileSync(process.argv[2]));
const cats = Object.keys(s.totals).filter((k) => !["total", "recipientCount"].includes(k));
let grand = 0n;
for (const cat of cats) {
  let sum = 0n;
  for (const [addr, rec] of Object.entries(s.recipients)) {
    if (addr !== addr.toLowerCase()) throw `non-lowercase key ${addr}`;
    for (const line of rec[cat] ?? []) sum += BigInt(line.amount);
  }
  if (sum !== BigInt(s.totals[cat])) throw `${cat}: lines ${sum} != totals ${s.totals[cat]}`;
  grand += sum;
}
if (grand !== BigInt(s.totals.total)) throw `total mismatch`;
if (Object.keys(s.recipients).length !== s.totals.recipientCount) throw `recipientCount mismatch`;
for (const [addr, rec] of Object.entries(s.recipients)) {
  const t = cats.reduce((a, c) => a + (rec[c] ?? []).reduce((x, l) => x + BigInt(l.amount), 0n), 0n);
  if (t !== BigInt(rec.total)) throw `${addr}: recipient.total mismatch`;
}
console.log("OK");
```

If your program's rewards come from a calculator pipeline (like Curate's [tag-registry-rewards](https://github.com/kleros/tag-registry-rewards) `--mode document`), generate the snapshot there so totals are computed from the same records as the payments — that makes rule 2 hold by construction.

---

## Step 2 — Upload to IPFS via Kleros' Filebase

Kleros pins reward snapshots through Filebase. You need a `FILEBASE_TOKEN` (ask the team; tag-registry-rewards keeps one in its `.env`). Upload each file individually:

```js
// upload.mjs — node upload.mjs poh-rewards-2026-07.json   (FILEBASE_TOKEN in env)
import { readFileSync } from "fs";
import { FilebaseClient, File } from "@filebase/client";

const fileName = process.argv[2];
const filebase = new FilebaseClient({ token: process.env.FILEBASE_TOKEN });
const cid = await filebase.storeDirectory([
  new File([readFileSync(fileName)], fileName, { type: "application/json" }),
]);
console.log(`https://cdn.kleros.link/ipfs/${cid}/${fileName}`);
```

This is exactly what tag-registry-rewards' `src/utils/file-to-ipfs.ts` does; reuse that if you're inside a pipeline. The resulting URL shape is always:

```
https://cdn.kleros.link/ipfs/<cid>/<filename>.json
```

**Always verify the upload before publishing the URL** — fetch it back through the gateway and byte-compare with your local file:

```bash
curl -s https://cdn.kleros.link/ipfs/<cid>/poh-rewards-2026-07.json | shasum
shasum poh-rewards-2026-07.json     # must match
```

The `cdn.kleros.link` gateway serves `Access-Control-Allow-Origin: *`, so the dashboard can fetch it directly from the browser.

---

## Step 3 — Publish the index

The index is a JSON array of snapshot URLs — one entry per period, **plain strings**:

```json
[
 "https://cdn.kleros.link/ipfs/Qm…/poh-rewards-2026-07.json",
 "https://cdn.kleros.link/ipfs/Qm…/poh-rewards-2026-08.json"
]
```

Two hosting patterns, both in use today:

- **Bundled** (like Curate): commit it as `src/assets/poh-rewards-index.json`. Adding a month = a one-line PR to this repo. Simple, reviewable, works offline in dev.
- **Live endpoint** (like Staking): your project serves the index at a stable URL (e.g. `poh.kleros.io/rewards-index.json`). New months appear with no dashboard changes — but the endpoint **must send CORS `Access-Control-Allow-Origin: *`**, and if it's down the section shows an error state. Verify CORS with `curl -sI -H "Origin: https://example.com" <url> | grep -i access-control`.

Start bundled; move to a live endpoint once your publishing cadence is established.

**Re-publishing your bundled index as a static endpoint — automatic.** If you bundle the index, exposing it by URL (so other projects can consume it, the way Curate publishes `/curate-rewards.json`) requires **no code**: name your file `src/assets/<program>-index.json` and the `viteStaticCopy` convention in [vite.config.ts](../vite.config.ts) publishes it at `/<program>.json`, validated by the shared [scripts/validate-rewards-index.ts](../scripts/validate-rewards-index.ts) (https URLs ending in `<program>-YYYY-MM.json`, strictly ascending months — a violation fails the build). It works live in a running dev server too — adding the file serves the endpoint within seconds, no restart (one dev-only edge: *deleting* a manifest mid-session keeps its stale entry until the dev server restarts). The Netlify wildcard header rule in [netlify.toml](../netlify.toml) already gives every published `/*.json` manifest CORS and the right cache policy. If your program's snapshot filenames can't follow the `<program>-YYYY-MM.json` shape, extend the validator rather than bypassing it.

---

## Step 4 — Write the data hook

Create `src/hooks/usePohRewards.ts`. Copy `useCurateRewards.ts` — it is the intended template — and adapt the types and aggregation. The contract every hook returns:

```ts
{ phase: "fetching" | "done" | "error", progress: ProgressState, errors: string[], data: PohData | null, retry: () => void }
```

Rules that matter (each one is a past bug):

- Fetch all snapshots with `fetchAllWithProgress` from `utils/fetchSnapshots` — it handles concurrency (5 at a time), per-file retries with backoff, and progress reporting. Failed files land in `errors` without aborting the run.
- Parse amounts with `toWei()` from `utils/format` (guarded), **never raw `BigInt(str)`** — a single malformed amount in a fetched file must degrade to `0n`, not white-screen the page.
- Aggregate in `bigint` wei end to end; only convert at the display/export edge (`formatPNK`, `toPnkNumber`).
- Lowercase recipient addresses when building your maps, so click-through lookups can't miss on a checksummed key.
- Treat remote input as untrusted: validate the index/snapshot shape inside a `try/catch` that ends in `setPhase("error")` — never let `run()` reject unhandled (that strands the page on the spinner with no Retry).

---

## Step 5 — Build the page

Create `src/pages/PohRewards.tsx`. Copy `CurateRewards.tsx` and adapt. The shared components do the heavy lifting:

| Component | What it gives you |
|---|---|
| `RewardsTable` | search, sort, pagination (100/page). Rows are `Record<string, string \| bigint>`; bigints render as PNK, column 0 is the search key. Pass `defaultSortKey` for date-ordered tabs. |
| `Tabs` | the `Monthly Totals / Summary / <period>` bar. Keep **Monthly Totals first** — both existing sections default to it. |
| `StatsRow` | the stat cards above the tabs (per-category totals for the current scope). |
| `FetchProgress`, `ErrorState`, `PageHeader`, `AddressCell`, buttons | loading bar with ETA, error + Retry, title/actions row, ellipsized mono addresses. |

Conventions to keep for consistency:

- Tab order: `Monthly Totals`, `Summary`, then periods newest-first; Monthly Totals sorts by date (pass `defaultSortKey`), the others by total descending.
- Clicking a month row jumps to that month's tab; clicking a recipient opens a per-line drill-down (see `WalletDetail` in CurateRewards).
- Offer an export (CSV like Curate or XLSX like Staking) via the helpers in `utils/format` / the `xlsx` package.
- styled-components v6 gotcha: pseudo-selectors in templates must be written `&:hover`, `&:active`, etc. A bare `:hover` compiles to a *descendant* selector and silently does the wrong thing.
- Use theme tokens (`theme.accent`, `theme.hoverBackground`, …) — never hardcode colors or re-derive light/dark ternaries.

---

## Step 6 — Register the section

1. **Route** — `src/App.tsx`: `<Route path="poh-rewards" element={<PohRewards />} />`.
2. **Home card** — `src/pages/Home.tsx`: add an entry to `SECTIONS` (eyebrow, title, description with the program's start date, route). The "More reward programs — coming soon" card stays last.
3. **Header link** — `src/components/Layout.tsx`: add a `StyledNavLink` next to Staking/Curate.
4. **README** — add the section to the "Live sections" list and the data-source bullet under "How the data works".

---

## Step 7 — Verify before shipping

- [ ] `yarn check-types` and `yarn build` pass.
- [ ] Independently re-verify the *data*: re-download every published snapshot through the index and re-run the Step 1 validation against your program's source-of-truth records (payment spreadsheet or on-chain transfers). The dashboard displays whatever IPFS says — correctness has to be proven at the data layer.
- [ ] Every tab renders; stat cards match the table beneath them (if they don't, your totals/lines disagree — fix the data, not the UI).
- [ ] Search by full address works; clicking a recipient opens the right drill-down; Back returns.
- [ ] Export opens in a spreadsheet with numeric columns.
- [ ] Both themes look right; hover/focus states work.
- [ ] Kill your network (devtools offline) → the section shows the error state with a working Retry, not a dead spinner.

That's it. The whole point of the architecture is that a new program touches 5 code files (`hook`, `page`, `App.tsx`, `Home.tsx`, `Layout.tsx`) plus its data (snapshots + index) — everything else is shared.
