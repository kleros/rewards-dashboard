import { basename } from "node:path";

// Shared validator for the published reward-index manifests. Every file named
// src/assets/<program>-index.json is published at /<program>.json (see
// vite.config.ts); this enforces the shape those manifests must have. Throwing
// here fails `vite build` and surfaces in the dev server log, so a malformed
// manifest can never be published silently.
//
// Rules (each one guards a real consumer assumption):
// - entries are https URLs with a host (no hostless "https://file.json" typos)
// - each URL's path ends with "<program>-YYYY-MM.json", MM 01-12 — consumers
//   parse the month token out of the URL
// - months are strictly ascending — consumers may read the last entry as the
//   latest period, so backfills must be inserted in order (this also implies
//   no duplicate months)
export function validateRewardsIndex(content: string, sourcePath: string): string {
  const sourceName = basename(sourcePath);
  const program = sourceName.replace(/-index\.json$/, "");

  let index: unknown;
  try {
    index = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `failed to parse ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!Array.isArray(index) || index.length === 0) {
    throw new Error(`${sourceName} must be a non-empty array of URLs`);
  }

  const entryPattern = new RegExp(`/${program}-(\\d{4}-(?:0[1-9]|1[0-2]))\\.json$`);
  let previousMonth = "";
  for (const entry of index) {
    if (typeof entry !== "string") {
      throw new Error(`${sourceName}: entry is not a string: ${String(entry)}`);
    }
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error(`${sourceName}: entry is not a valid URL: ${entry}`);
    }
    if (url.protocol !== "https:" || !url.hostname) {
      throw new Error(`${sourceName}: entry is not an https URL: ${entry}`);
    }
    const match = url.pathname.match(entryPattern);
    if (!match) {
      throw new Error(
        `${sourceName}: entry "${entry}" must end with "${program}-YYYY-MM.json" (MM 01-12)`
      );
    }
    if (match[1] <= previousMonth) {
      throw new Error(
        `${sourceName}: months must be strictly ascending — ` +
          `${match[1]} appears after ${previousMonth}. Insert new entries in month order.`
      );
    }
    previousMonth = match[1];
  }

  // Publish a normalized (minified) copy regardless of source formatting.
  return `${JSON.stringify(index)}\n`;
}
