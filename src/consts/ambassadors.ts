import { WEI } from "consts/index";

// Agent Ambassador Program: which Curate lists the section reads, and the fixed
// reward rates. Every accepted entry on the Standard list earns 50 PNK and on the
// High Quality list 150 PNK, capped per agent (one wallet = one agent).

export type AmbassadorCategory = "standard" | "high";

export interface AmbassadorList {
  category: AmbassadorCategory;
  label: string;
  // Lowercase Light Curate (LGTCR) registry address.
  address: string;
  // The policy jurors apply to this list (the file its MetaEvidence references).
  policyUrl?: string;
}

export interface AmbassadorProfile {
  chainId: number;
  lists: AmbassadorList[];
  // Only entries submitted inside the season window count (unix seconds).
  seasonStart?: number;
  seasonEnd?: number;
  // Cap on fetched entries. Only the preview profile needs it: it borrows two
  // busy Scout lists that hold thousands of items.
  entryLimit?: number;
  // Shown under the page title when the data is not the program's own lists.
  notice?: string;
  // Sample entries bundled with the app instead of live data (layout checks only).
  demo?: boolean;
}

// "gnosis" reads the program's two lists and is the default. "sepolia" reads the
// test list. "demo" shows bundled sample entries (made-up agents) for layout
// checks, and "preview" borrows two live Scout lists to try the page on busy data.
const PROFILES: Record<string, AmbassadorProfile> = {
  demo: {
    chainId: 100,
    lists: [
      { category: "standard", label: "Standard", address: "" },
      { category: "high", label: "High Quality", address: "" },
    ],
    demo: true,
    notice:
      "Sample data for layout only: made-up agents and entries. Two entries link real public Kleros posts to test link previews.",
  },
  preview: {
    chainId: 100,
    lists: [
      { category: "standard", label: "Standard", address: "0xee1502e29795ef6c2d60f8d7120596abe3bad990" },
      { category: "high", label: "High Quality", address: "0x66260c69d03837016d88c9877e61e08ef74c59f2" },
    ],
    entryLimit: 300,
    notice:
      "Preview data: two live Scout lists (Kleros Tokens as Standard, Address Tags as High Quality) stand in for the program lists.",
  },
  // Only a Standard test list is deployed on Sepolia; an empty address is skipped.
  sepolia: {
    chainId: 11155111,
    lists: [
      { category: "standard", label: "Standard", address: "0x28a604bbd963eec5709639f349575266d8734102" },
      { category: "high", label: "High Quality", address: "" },
    ],
    notice: "Test data on Sepolia: a Standard test list only. Nothing on it is rewarded.",
  },
  gnosis: {
    chainId: 100,
    lists: [
      {
        category: "standard",
        label: "Standard",
        address: "0x1ef1f0fd8d702b8b03dc1f8f8b365e634cde90ee",
        policyUrl: "https://cdn.kleros.link/ipfs/QmUXoPTpFEoXpY5yv7ukN5fjfiHnK4kfd3NTWREm99EY4b",
      },
      {
        category: "high",
        label: "High Quality",
        address: "0x78e85c1b148452996af7ba2b0a4a87c01d23aac3",
        policyUrl: "https://cdn.kleros.link/ipfs/QmSLq4kJXQJgM6uDbohuihnNwjPbKDMsbt3uoKW5ENEoLX",
      },
    ],
    // Season 1: Monday 5 October to Sunday 1 November 2026, UTC (the end is exclusive).
    seasonStart: Date.UTC(2026, 9, 5) / 1000,
    seasonEnd: Date.UTC(2026, 10, 2) / 1000,
  },
};

// ?data=<profile> in the page URL overrides the build setting (local checks only).
const urlProfile =
  typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("data");

export const AMBASSADOR_PROFILE_NAME: string = urlProfile ?? import.meta.env.VITE_AMBASSADOR_PROFILE ?? "gnosis";
export const AMBASSADOR_PROFILE: AmbassadorProfile = PROFILES[AMBASSADOR_PROFILE_NAME] ?? PROFILES.gnosis;

// Public Envio indexer used by the Curate app (all chains, no key).
export const CURATE_INDEXER_URL = "https://indexer.hyperindex.xyz/1a2f51c/v1/graphql";
export const CURATE_APP_URL = "https://curate.kleros.io";

export const REWARD_PER_ENTRY: Record<AmbassadorCategory, bigint> = {
  standard: 50n * WEI,
  high: 150n * WEI,
};
export const AGENT_REWARD_CAP = 50_000n * WEI;
export const PROGRAM_BUDGET = 500_000n * WEI;

// Minimums from the list policies, checked when an entry is submitted.
export const MIN_FOLLOWERS = 20;
export const MIN_REACH: Record<AmbassadorCategory, { views: number; engagements: number }> = {
  standard: { views: 100, engagements: 10 },
  high: { views: 500, engagements: 100 },
};
