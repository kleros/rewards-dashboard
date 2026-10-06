import { useCallback, useEffect, useState } from "react";

import {
  AGENT_REWARD_CAP,
  AMBASSADOR_PROFILE,
  AmbassadorCategory,
  AmbassadorProfile,
  CURATE_APP_URL,
  CURATE_INDEXER_URL,
  REWARD_PER_ENTRY,
} from "consts/ambassadors";
import demoEntries from "assets/ambassador-demo-entries.json";
import { ProgressState } from "utils/fetchSnapshots";

// Live data source: the Curate indexer (Envio) that the Curate app itself reads.
// Every program entry is a Light Curate item on one of the two program lists with
// three fields: Title, Description and Link (the public post on the agent's own
// channel). The indexer returns the fields already decoded (`props`) plus the
// item's request history, from which we derive its status and who submitted it.

const PAGE_SIZE = 500;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 1000;

// "Removal requested": someone asked to remove an accepted entry (for example
// because its post was taken down); it stays accepted unless the removal succeeds.
export type EntryStatus = "Pending" | "Challenged" | "Accepted" | "Removal requested" | "Rejected" | "Removed";

export interface AmbassadorEntry {
  key: string;
  itemID: string;
  category: AmbassadorCategory;
  listLabel: string;
  status: EntryStatus;
  submitter: string; // lowercase wallet = the agent
  submittedAt: number; // unix seconds of the registration request
  title: string;
  description: string;
  link: string; // the public post
  curateUrl: string; // empty for sample data
  fields: Record<string, string>;
  removalBy?: string; // lowercase wallet that removed the entry, or asked to
}

export interface AmbassadorAgent {
  wallet: string;
  channel: string; // "@handle" or site, from the agent's latest link
  entries: number;
  accepted: number;
  pending: number;
  challenged: number;
  rejected: number;
  standardAccepted: number;
  highAccepted: number;
  earned: bigint; // fixed rate per accepted entry, capped per agent
  capped: boolean;
}

// A wallet that removed accepted entries that broke the policy after acceptance.
export interface AmbassadorRemover {
  wallet: string;
  removals: number;
}

export interface AmbassadorData {
  entries: AmbassadorEntry[];
  agents: AmbassadorAgent[];
  removers: AmbassadorRemover[];
  totals: {
    entries: number;
    accepted: number;
    pending: number;
    challenged: number;
    rejected: number;
    removed: number;
    earned: bigint;
  };
}

interface RawRequest {
  requestType: string; // RegistrationRequested | ClearingRequested
  disputed: boolean;
  resolved: boolean;
  disputeOutcome: string; // None | Accept | Reject
  submissionTime: string;
  requester: string;
}

interface RawItem {
  itemID: string;
  registryAddress: string;
  status: string; // Absent | Registered | RegistrationRequested | ClearingRequested
  disputed: boolean;
  props: { label: string; value: string | null; isIdentifier: boolean }[];
  requests: RawRequest[];
}

const ENTRIES_QUERY = `query Entries($registries: [String!]!, $chainId: Int!, $limit: Int!, $offset: Int!) {
  LItem(
    where: { registryAddress: { _in: $registries }, chainId: { _eq: $chainId } }
    order_by: [{ latestRequestSubmissionTime: desc }, { id: asc }]
    limit: $limit
    offset: $offset
  ) {
    itemID
    registryAddress
    status
    disputed
    props { label value isIdentifier }
    requests(order_by: { submissionTime: asc }) {
      requestType
      disputed
      resolved
      disputeOutcome
      submissionTime
      requester
    }
  }
}`;

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function queryIndexer<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(CURATE_INDEXER_URL, {
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
      if (attempt < MAX_ATTEMPTS) await delay(RETRY_BACKOFF_MS * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("indexer request failed");
}

async function fetchAllItems(
  profile: AmbassadorProfile,
  reportProgress: (progress: ProgressState) => void,
  startTime: number
): Promise<RawItem[]> {
  const registries = profile.lists.map((list) => list.address.toLowerCase()).filter(Boolean);
  if (registries.length === 0) throw new Error("no list addresses configured for this profile");

  const limit = profile.entryLimit ?? Number.POSITIVE_INFINITY;
  const items: RawItem[] = [];
  let pageWasFull = true;

  while (pageWasFull && items.length < limit) {
    const pageSize = Math.min(PAGE_SIZE, limit - items.length);
    const { LItem } = await queryIndexer<{ LItem: RawItem[] }>(ENTRIES_QUERY, {
      registries,
      chainId: profile.chainId,
      limit: pageSize,
      offset: items.length,
    });
    items.push(...LItem);
    pageWasFull = LItem.length === pageSize;

    reportProgress({
      done: items.length,
      total: items.length + (pageWasFull ? pageSize : 0),
      current: `${items.length.toLocaleString()} entries`,
      startTime,
    });
  }

  return items;
}

// The entry's status for the program: an item is accepted once registered, and
// an absent item was either rejected in a challenge or later removed.
function deriveStatus(item: RawItem, registration: RawRequest): EntryStatus {
  switch (item.status) {
    case "Registered":
      return "Accepted";
    case "ClearingRequested":
      return "Removal requested";
    case "RegistrationRequested":
      return item.disputed ? "Challenged" : "Pending";
    default: {
      const removedLater = item.requests.some(
        (request) =>
          request.requestType === "ClearingRequested" &&
          request.resolved &&
          Number(request.submissionTime) > Number(registration.submissionTime)
      );
      return removedLater && registration.disputeOutcome !== "Reject" ? "Removed" : "Rejected";
    }
  }
}

// The wallet behind the latest removal request after the registration: the one
// that removed the entry (status Removed) or is asking to (Removal requested).
function removalRequester(item: RawItem, registration: RawRequest): string | undefined {
  const removals = item.requests.filter(
    (request) =>
      request.requestType === "ClearingRequested" &&
      Number(request.submissionTime) > Number(registration.submissionTime)
  );
  return removals[removals.length - 1]?.requester.toLowerCase();
}

function toEntry(item: RawItem, profile: AmbassadorProfile): AmbassadorEntry | null {
  const registrations = item.requests.filter((request) => request.requestType === "RegistrationRequested");
  const registration = registrations[registrations.length - 1];
  if (!registration) return null;

  const registry = item.registryAddress.toLowerCase();
  const list = profile.lists.find((candidate) => candidate.address.toLowerCase() === registry);
  if (!list) return null;

  const fields = Object.fromEntries(item.props.map((prop) => [prop.label, prop.value ?? ""]));
  const firstIdentifier = item.props.find((prop) => prop.isIdentifier && prop.value)?.value ?? "";

  return {
    key: `${registry}:${item.itemID}`,
    itemID: item.itemID,
    category: list.category,
    listLabel: list.label,
    status: deriveStatus(item, registration),
    submitter: registration.requester.toLowerCase(),
    submittedAt: Number(registration.submissionTime),
    title: fields["Title"] || firstIdentifier || item.itemID,
    description: fields["Description"] ?? "",
    link: fields["Link"] ?? "",
    curateUrl: `${CURATE_APP_URL}/tcr/${profile.chainId}/${registry}/${item.itemID}`,
    fields,
    removalBy: removalRequester(item, registration),
  };
}

interface DemoEntry {
  category: AmbassadorCategory;
  status: EntryStatus;
  submitter: string;
  submittedAt: string; // ISO 8601
  fields: Record<string, string>;
  removalBy?: string;
}

function demoToEntries(profile: AmbassadorProfile): AmbassadorEntry[] {
  return (demoEntries as DemoEntry[]).map((demo, index) => ({
    key: `demo:${index}`,
    itemID: `demo-${index}`,
    category: demo.category,
    listLabel: profile.lists.find((list) => list.category === demo.category)?.label ?? demo.category,
    status: demo.status,
    submitter: demo.submitter.toLowerCase(),
    submittedAt: Math.floor(Date.parse(demo.submittedAt) / 1000),
    title: demo.fields["Title"] ?? "",
    description: demo.fields["Description"] ?? "",
    link: demo.fields["Link"] ?? "",
    curateUrl: "",
    fields: demo.fields,
    removalBy: demo.removalBy?.toLowerCase(),
  }));
}

// "@handle" for X links, otherwise the site's host name.
export function channelOf(link: string): string {
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "x.com" || host === "twitter.com") {
      const handle = url.pathname.split("/").filter(Boolean)[0];
      return handle ? `@${handle}` : host;
    }
    return host;
  } catch {
    return "";
  }
}

function inSeason(entry: AmbassadorEntry, profile: AmbassadorProfile): boolean {
  if (profile.seasonStart && entry.submittedAt < profile.seasonStart) return false;
  if (profile.seasonEnd && entry.submittedAt >= profile.seasonEnd) return false;
  return true;
}

// Group entries by submitting wallet and apply the fixed reward rates.
export function aggregate(entries: AmbassadorEntry[]): AmbassadorData {
  const byWallet = new Map<string, AmbassadorEntry[]>();
  for (const entry of entries) {
    const bucket = byWallet.get(entry.submitter) ?? [];
    bucket.push(entry);
    byWallet.set(entry.submitter, bucket);
  }

  const agents: AmbassadorAgent[] = [...byWallet.entries()].map(([wallet, walletEntries]) => {
    const newestFirst = [...walletEntries].sort((a, b) => b.submittedAt - a.submittedAt);
    const count = (status: EntryStatus) => walletEntries.filter((entry) => entry.status === status).length;
    // An entry with a pending removal request is still accepted until it is removed.
    const isAccepted = (entry: AmbassadorEntry) =>
      entry.status === "Accepted" || entry.status === "Removal requested";
    const acceptedIn = (category: AmbassadorCategory) =>
      walletEntries.filter((entry) => isAccepted(entry) && entry.category === category).length;

    const standardAccepted = acceptedIn("standard");
    const highAccepted = acceptedIn("high");
    const uncapped =
      BigInt(standardAccepted) * REWARD_PER_ENTRY.standard + BigInt(highAccepted) * REWARD_PER_ENTRY.high;

    return {
      wallet,
      channel: channelOf(newestFirst.find((entry) => entry.link)?.link ?? ""),
      entries: walletEntries.length,
      accepted: walletEntries.filter(isAccepted).length,
      pending: count("Pending"),
      challenged: count("Challenged"),
      rejected: count("Rejected"),
      standardAccepted,
      highAccepted,
      earned: uncapped > AGENT_REWARD_CAP ? AGENT_REWARD_CAP : uncapped,
      capped: uncapped > AGENT_REWARD_CAP,
    };
  });

  const countAll = (status: EntryStatus) => entries.filter((entry) => entry.status === status).length;

  const removalsByWallet = new Map<string, number>();
  for (const entry of entries) {
    if (entry.status === "Removed" && entry.removalBy) {
      removalsByWallet.set(entry.removalBy, (removalsByWallet.get(entry.removalBy) ?? 0) + 1);
    }
  }
  const removers = [...removalsByWallet.entries()].map(([wallet, removals]) => ({ wallet, removals }));

  return {
    entries,
    agents,
    removers,
    totals: {
      entries: entries.length,
      accepted: countAll("Accepted") + countAll("Removal requested"),
      pending: countAll("Pending"),
      challenged: countAll("Challenged"),
      rejected: countAll("Rejected"),
      removed: countAll("Removed"),
      earned: agents.reduce((sum, agent) => sum + agent.earned, 0n),
    },
  };
}

export type AmbassadorPhase = "fetching" | "done" | "error";

export function useAmbassadorEntries(profile: AmbassadorProfile = AMBASSADOR_PROFILE) {
  const [phase, setPhase] = useState<AmbassadorPhase>("fetching");
  const [progress, setProgress] = useState<ProgressState>({ done: 0, total: 0, current: "", startTime: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [data, setData] = useState<AmbassadorData | null>(null);

  const run = useCallback(async () => {
    setPhase("fetching");
    setErrors([]);
    const startTime = Date.now();
    setProgress({ done: 0, total: PAGE_SIZE, current: "Querying the Curate indexer…", startTime });

    try {
      const entries = profile.demo
        ? demoToEntries(profile)
        : (await fetchAllItems(profile, setProgress, startTime))
            .map((item) => toEntry(item, profile))
            .filter((entry): entry is AmbassadorEntry => entry !== null && inSeason(entry, profile));
      setData(aggregate(entries));
      setPhase("done");
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "unknown error"]);
      setPhase("error");
    }
  }, [profile]);

  useEffect(() => {
    run();
  }, [run]);

  return { phase, progress, errors, data, retry: run };
}
