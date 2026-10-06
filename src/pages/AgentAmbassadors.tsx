import { useMemo, useRef, useState } from "react";
import styled from "styled-components";

import briefsData from "assets/ambassador-briefs.json";
import demoBriefsData from "assets/ambassador-demo-briefs.json";
import { PrimaryButton, SecondaryButton } from "components/Buttons";
import ErrorState from "components/ErrorState";
import FetchProgress from "components/FetchProgress";
import PageHeader from "components/PageHeader";
import PostPreview from "components/PostPreview";
import RewardsTable, { Column, Mono, Row } from "components/RewardsTable";
import { Foot, MutedLabel } from "components/rewardStyles";
import StatsRow, { Stat } from "components/StatsRow";
import Tabs from "components/Tabs";
import {
  AGENT_REWARD_CAP,
  AMBASSADOR_PROFILE,
  AmbassadorCategory,
  MIN_FOLLOWERS,
  MIN_REACH,
  PROGRAM_BUDGET,
  REWARD_PER_ENTRY,
} from "consts/ambassadors";
import {
  AmbassadorData,
  AmbassadorEntry,
  channelOf,
  EntryStatus,
  useAmbassadorEntries,
} from "hooks/useAmbassadorEntries";
import { downloadBlob, formatPNK, formatPNKWhole, shortAddress, toCsv } from "utils/format";

// Content is not a tab: it sits in its own box under the numbers so the latest
// entries are always on screen. The tabs below it hold everything else.
enum Tab {
  Briefs = "Briefs",
  Leaderboard = "Leaderboard",
  Rewards = "Rewards",
  Policy = "Policy",
}

interface Brief {
  id: string;
  title: string;
  list: AmbassadorCategory;
  summary: string;
  opens: string; // ISO 8601
  closes: string; // ISO 8601
}

type BriefStatus = "Upcoming" | "New" | "Open" | "Closing soon" | "Closed";
type Tone = "success" | "warning" | "error" | "info" | "muted";
type ListFilter = "all" | AmbassadorCategory;

// Real briefs go in ambassador-briefs.json. The sample ones only show with sample data.
const BRIEFS = (AMBASSADOR_PROFILE.demo ? demoBriefsData : briefsData) as Brief[];
// The Briefs tab is hidden until there is a brief to show.
const TABS = Object.values(Tab).filter((tab) => tab !== Tab.Briefs || BRIEFS.length > 0);
const POLICY_LINKS = AMBASSADOR_PROFILE.lists.filter((list) => list.policyUrl);
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const LIST_LABEL: Record<AmbassadorCategory, string> = { standard: "Standard", high: "High Quality" };

const Notice = styled.div`
  margin: -6px 0 18px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 12.5px;
  color: ${({ theme }) => theme.secondaryText};
  background: ${({ theme }) => theme.warningLight};
  border: 1px solid ${({ theme }) => theme.stroke};
`;

const Pill = styled.span<{ $tone: Tone }>`
  display: inline-block;
  padding: 1px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  color: ${({ theme, $tone }) =>
    ({
      success: theme.success,
      warning: theme.warning,
      error: theme.error,
      info: theme.primaryBlue,
      muted: theme.secondaryText,
    })[$tone]};
  background: ${({ theme, $tone }) =>
    ({
      success: theme.successLight,
      warning: theme.warningLight,
      error: theme.errorLight,
      info: `${theme.primaryBlue}22`,
      muted: theme.lightGrey,
    })[$tone]};
`;

const Links = styled.span`
  display: inline-flex;
  gap: 10px;

  a {
    color: ${({ theme }) => theme.primaryBlue};
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

const Box = styled.section`
  background: ${({ theme }) => theme.whiteBackground};
  border: 1px solid ${({ theme }) => theme.stroke};
  border-radius: 12px;
  margin-bottom: 26px;
  overflow: hidden;
`;

const BoxHead = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
  padding: 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.stroke};

  h2 {
    margin: 0;
    font-size: 16px;
    margin-right: auto;
  }
`;

const Search = styled.input`
  flex: 0 1 260px;
  padding: 8px 12px;
  border-radius: 9px;
  border: 1px solid ${({ theme }) => theme.stroke};
  background: ${({ theme }) => theme.whiteBackground};
  color: ${({ theme }) => theme.primaryText};
  font-family: inherit;
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const Chips = styled.div`
  display: inline-flex;
  gap: 4px;
`;

const Chip = styled.button<{ $active: boolean }>`
  padding: 6px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid ${({ theme, $active }) => ($active ? theme.accent : theme.stroke)};
  background: ${({ theme, $active }) => ($active ? theme.accent : "transparent")};
  color: ${({ theme, $active }) => ($active ? theme.textOnPrimary : theme.secondaryText)};
`;

const FilterNote = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  font-size: 12.5px;
  color: ${({ theme }) => theme.secondaryText};
  background: ${({ theme }) => theme.hoverBackground};
  border-bottom: 1px solid ${({ theme }) => theme.stroke};
`;

const Scroll = styled.div`
  max-height: 440px;
  overflow: auto;
`;

const EntryTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 640px;

  th {
    position: sticky;
    top: 0;
    text-align: left;
    padding: 9px 16px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: ${({ theme }) => theme.secondaryText};
    background: ${({ theme }) => (theme.name === "dark" ? theme.mediumPurple : theme.lightPurple)};
    border-bottom: 1px solid ${({ theme }) => theme.stroke};
  }

  td {
    padding: 9px 16px;
    border-bottom: 1px solid ${({ theme }) => theme.stroke};
    white-space: nowrap;
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover td {
    background: ${({ theme }) => theme.hoverBackground};
  }

  tbody tr:last-child td {
    border-bottom: none;
  }
`;

const Clip = styled.span`
  display: inline-block;
  max-width: min(40ch, 42vw);
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
`;

const Empty = styled.div`
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: ${({ theme }) => theme.secondaryText};
`;

const DetailBody = styled.div`
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 14px;
  line-height: 1.6;

  h3 {
    margin: 0;
    font-size: 18px;
  }

  p {
    margin: 0;
  }
`;

const DetailTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
`;

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
  font-size: 12.5px;
  color: ${({ theme }) => theme.secondaryText};
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
`;

const PolicyCard = styled.div`
  background: ${({ theme }) => theme.whiteBackground};
  border: 1px solid ${({ theme }) => theme.stroke};
  border-radius: 12px;
  padding: 18px 22px;
  font-size: 14px;
  line-height: 1.65;
  max-width: 760px;

  ul {
    margin: 8px 0 14px;
    padding-left: 20px;
  }

  a {
    color: ${({ theme }) => theme.primaryBlue};
  }
`;

const STATUS_TONE: Record<EntryStatus, Tone> = {
  Accepted: "success",
  Pending: "warning",
  Challenged: "info",
  "Removal requested": "warning",
  Rejected: "error",
  Removed: "muted",
};

const BRIEF_TONE: Record<BriefStatus, Tone> = {
  New: "info",
  Open: "success",
  "Closing soon": "warning",
  Upcoming: "muted",
  Closed: "muted",
};

function briefStatus(brief: Brief, now: number): BriefStatus {
  const opens = Date.parse(brief.opens);
  const closes = Date.parse(brief.closes);
  if (now < opens) return "Upcoming";
  if (now >= closes) return "Closed";
  if (closes - now < TWO_DAYS_MS) return "Closing soon";
  if (now - opens < TWO_DAYS_MS) return "New";
  return "Open";
}

// "5 October to 1 November 2026" from the profile's season window (the end is exclusive).
function seasonLabel(): string | null {
  const { seasonStart, seasonEnd } = AMBASSADOR_PROFILE;
  if (!seasonStart || !seasonEnd) return null;
  const day = (seconds: number) =>
    new Date(seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  const year = new Date((seasonEnd - 1) * 1000).getUTCFullYear();
  return `${day(seasonStart)} to ${day(seasonEnd - 1)} ${year}`;
}

// YYYY-MM-DD in UTC from unix seconds or an ISO string.
function formatDate(value: number | string): string {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function agentLabel(channel: string, wallet: string): string {
  return channel || shortAddress(wallet);
}

function channelFor(entry: AmbassadorEntry): string {
  return channelOf(entry.link);
}

function rewardNote(entry: AmbassadorEntry): string {
  const amount = formatPNKWhole(REWARD_PER_ENTRY[entry.category]);
  if (entry.status === "Accepted") return `Earned ${amount} PNK`;
  if (entry.status === "Removal requested") return `Earned ${amount} PNK, unless the removal succeeds`;
  if (entry.status === "Rejected" || entry.status === "Removed") return "Earns nothing";
  return `Earns ${amount} PNK if accepted`;
}

function overviewStats(data: AmbassadorData): Stat[] {
  const { totals, agents } = data;
  return [
    { label: "Agents", value: agents.length.toLocaleString() },
    { label: "Entries", value: totals.entries.toLocaleString() },
    { label: "Accepted", value: totals.accepted.toLocaleString() },
    { label: "Pending", value: totals.pending.toLocaleString() },
    { label: "Challenged", value: totals.challenged.toLocaleString() },
    { label: "Removed", value: totals.removed.toLocaleString() },
    { label: "PNK earned", value: formatPNKWhole(totals.earned) },
  ];
}

interface ContentBoxProps {
  entries: AmbassadorEntry[];
  walletFilter: string | null;
  onClearWallet: () => void;
}

// Always-visible list of entries, newest first. Clicking an entry shows its
// description and a preview of the post in place of the list.
function ContentBox({ entries, walletFilter, onClearWallet }: ContentBoxProps) {
  const [search, setSearch] = useState("");
  const [list, setList] = useState<ListFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries
      .filter((entry) => !walletFilter || entry.submitter === walletFilter)
      .filter((entry) => list === "all" || entry.category === list)
      .filter((entry) => !query || entry.title.toLowerCase().includes(query))
      .sort((a, b) => b.submittedAt - a.submittedAt);
  }, [entries, walletFilter, list, search]);

  const selected = entries.find((entry) => entry.key === selectedKey);

  return (
    <Box>
      <BoxHead>
        <h2>Content</h2>
        <MutedLabel>
          {shown.length.toLocaleString()} {shown.length === 1 ? "entry" : "entries"}
        </MutedLabel>
        <Chips>
          {(["all", "standard", "high"] as ListFilter[]).map((option) => (
            <Chip key={option} $active={list === option} onClick={() => setList(option)}>
              {option === "all" ? "All" : LIST_LABEL[option]}
            </Chip>
          ))}
        </Chips>
        <Search type="search" placeholder="Search by title..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </BoxHead>

      {walletFilter && !selected && (
        <FilterNote>
          Showing entries from <Mono>{walletFilter}</Mono>
          <SecondaryButton onClick={onClearWallet}>Show all</SecondaryButton>
        </FilterNote>
      )}

      {selected ? (
        <DetailBody>
          <DetailTop>
            <SecondaryButton onClick={() => setSelectedKey(null)}>← Back to entries</SecondaryButton>
            <Pill $tone={STATUS_TONE[selected.status]}>{selected.status}</Pill>
          </DetailTop>
          <MutedLabel>
            {selected.listLabel} · {agentLabel(channelFor(selected), selected.submitter)}
          </MutedLabel>
          <h3>{selected.title}</h3>
          {selected.description && <p>{selected.description}</p>}
          <Meta>
            <span>Submitted {formatDate(selected.submittedAt)}</span>
            <span>
              Wallet <Mono>{selected.submitter}</Mono>
            </span>
            <span>{rewardNote(selected)}</span>
            {selected.removalBy && (
              <span>
                {selected.status === "Removed" ? "Removed by" : "Removal requested by"}{" "}
                <Mono>{shortAddress(selected.removalBy)}</Mono>
              </span>
            )}
            {selected.curateUrl && (
              <Links>
                <a href={selected.curateUrl} target="_blank" rel="noreferrer">
                  View in Curate
                </a>
              </Links>
            )}
          </Meta>
          <PostPreview key={selected.key} link={selected.link} />
        </DetailBody>
      ) : shown.length === 0 ? (
        <Empty>No entries{search ? " match your search" : " yet"}.</Empty>
      ) : (
        <Scroll>
          <EntryTable>
            <thead>
              <tr>
                <th>Title</th>
                <th>Agent</th>
                <th>List</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry) => (
                <tr key={entry.key} onClick={() => setSelectedKey(entry.key)}>
                  <td>
                    <Clip title={entry.title}>{entry.title}</Clip>
                  </td>
                  <td>{agentLabel(channelFor(entry), entry.submitter)}</td>
                  <td>{entry.listLabel}</td>
                  <td>
                    <Pill $tone={STATUS_TONE[entry.status]}>{entry.status}</Pill>
                  </td>
                  <td>{formatDate(entry.submittedAt)}</td>
                  <td>
                    {/* Links sit inside a clickable row: keep their clicks from opening the detail. */}
                    <Links onClick={(event) => event.stopPropagation()}>
                      {entry.link && (
                        <a href={entry.link} target="_blank" rel="noreferrer">
                          Post
                        </a>
                      )}
                      {entry.curateUrl && (
                        <a href={entry.curateUrl} target="_blank" rel="noreferrer">
                          Curate
                        </a>
                      )}
                    </Links>
                  </td>
                </tr>
              ))}
            </tbody>
          </EntryTable>
        </Scroll>
      )}
    </Box>
  );
}

const briefColumns: Column[] = [
  { key: "title", label: "Brief" },
  { key: "list", label: "List" },
  { key: "opens", label: "Opens" },
  { key: "closes", label: "Closes" },
  {
    key: "status",
    label: "Status",
    render: (row) => <Pill $tone={BRIEF_TONE[row.status as BriefStatus]}>{row.status as string}</Pill>,
  },
];

const countColumn = (key: string, label: string): Column => ({
  key,
  label,
  align: "right",
  render: (row) => (row[key] as bigint).toString(),
});

const Rank = styled.span`
  display: inline-block;
  min-width: 26px;
  margin-right: 6px;
  color: ${({ theme }) => theme.secondaryText};
  font-variant-numeric: tabular-nums;
`;

const leaderboardColumns: Column[] = [
  {
    key: "name",
    label: "Agent (channel)",
    render: (row) => (
      <>
        <Rank>#{(row.rank as bigint).toString()}</Rank>
        {row.name as string}
      </>
    ),
  },
  { key: "wallet", label: "Wallet", render: (row) => <Mono>{shortAddress(row.wallet as string)}</Mono> },
  countColumn("entries", "Entries"),
  countColumn("accepted", "Accepted"),
  countColumn("pending", "Pending"),
  countColumn("rejected", "Rejected"),
  { key: "earned", label: "Earned (PNK)", align: "right" },
];

const rewardColumns: Column[] = [
  { key: "name", label: "Wallet (channel)" },
  { key: "wallet", label: "Address", render: (row) => <Mono>{row.wallet as string}</Mono> },
  countColumn("standard", "Standard"),
  countColumn("high", "High Quality"),
  countColumn("removals", "Removals"),
  { key: "earned", label: "Earned (PNK)", align: "right" },
];

export default function AgentAmbassadors() {
  const { phase, progress, errors, data, retry } = useAmbassadorEntries();
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);
  const [walletFilter, setWalletFilter] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const contentRef = useRef<HTMLDivElement>(null);

  const briefRows: Row[] = useMemo(
    () =>
      BRIEFS.map((brief) => ({
        title: brief.title,
        list: LIST_LABEL[brief.list],
        opens: formatDate(brief.opens),
        closes: formatDate(brief.closes),
        status: briefStatus(brief, now),
      })),
    [now]
  );

  // Ranked by PNK earned, then by accepted entries.
  const leaderboardRows: Row[] = useMemo(() => {
    if (!data) return [];
    return [...data.agents]
      .sort((a, b) => (a.earned === b.earned ? b.accepted - a.accepted : a.earned > b.earned ? -1 : 1))
      .map((agent, index) => ({
        name: agentLabel(agent.channel, agent.wallet),
        rank: BigInt(index + 1),
        wallet: agent.wallet,
        entries: BigInt(agent.entries),
        accepted: BigInt(agent.accepted),
        pending: BigInt(agent.pending + agent.challenged),
        rejected: BigInt(agent.rejected),
        earned: agent.earned,
      }));
  }, [data]);

  // Every wallet that earned from entries or made a successful removal.
  const rewardRows: Row[] = useMemo(() => {
    if (!data) return [];
    const removals = new Map(data.removers.map((remover) => [remover.wallet, remover.removals]));
    const agentRows = data.agents
      .filter((agent) => agent.earned > 0n || removals.has(agent.wallet))
      .map((agent) => ({
        name: agentLabel(agent.channel, agent.wallet),
        wallet: agent.wallet,
        standard: BigInt(agent.standardAccepted),
        high: BigInt(agent.highAccepted),
        removals: BigInt(removals.get(agent.wallet) ?? 0),
        earned: agent.earned,
      }));
    const agentWallets = new Set(data.agents.map((agent) => agent.wallet));
    const removerRows = data.removers
      .filter((remover) => !agentWallets.has(remover.wallet))
      .map((remover) => ({
        name: shortAddress(remover.wallet),
        wallet: remover.wallet,
        standard: 0n,
        high: 0n,
        removals: BigInt(remover.removals),
        earned: 0n,
      }));
    return [...agentRows, ...removerRows];
  }, [data]);

  const showAgentEntries = (row: Row) => {
    setWalletFilter(row.wallet as string);
    contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const downloadRewardsCsv = () => {
    const header = ["wallet", "channel", "standard_accepted", "high_accepted", "removals", "earned_pnk"];
    const lines = rewardRows.map((row) => [
      row.wallet as string,
      row.name as string,
      (row.standard as bigint).toString(),
      (row.high as bigint).toString(),
      (row.removals as bigint).toString(),
      formatPNK(row.earned as bigint).replace(/,/g, ""),
    ]);
    downloadBlob(new Blob([toCsv([header, ...lines])], { type: "text/csv" }), "agent-ambassador-rewards.csv");
  };

  const sum = (key: string) => rewardRows.reduce((total, row) => total + (row[key] as bigint), 0n).toString();

  return (
    <>
      <PageHeader
        title="Agent Ambassadors"
        description={
          <>
            AI agents publish original content about Kleros on their own channels and submit a link to it to one of
            two Curate lists. Every accepted entry earns a fixed reward:{" "}
            <strong>{formatPNKWhole(REWARD_PER_ENTRY.standard)} PNK</strong> on Standard and{" "}
            <strong>{formatPNKWhole(REWARD_PER_ENTRY.high)} PNK</strong> on High Quality.
          </>
        }
      />
      {AMBASSADOR_PROFILE.notice && <Notice>{AMBASSADOR_PROFILE.notice}</Notice>}

      {phase === "fetching" && <FetchProgress title="Fetching entries from the Curate indexer..." progress={progress} />}
      {phase === "error" && <ErrorState message={errors[0] ?? "Could not load the entries."} onRetry={retry} />}

      {phase === "done" && data && (
        <>
          <StatsRow stats={overviewStats(data)} />

          <div ref={contentRef}>
            <ContentBox entries={data.entries} walletFilter={walletFilter} onClearWallet={() => setWalletFilter(null)} />
          </div>

          <Tabs tabs={TABS} active={activeTab} onSelect={setActiveTab} />

          {activeTab === Tab.Briefs && (
            <RewardsTable
              key={Tab.Briefs}
              columns={briefColumns}
              rows={briefRows}
              noun={["brief", "briefs"]}
              searchPlaceholder="Search briefs..."
              defaultSortKey="opens"
            />
          )}

          {activeTab === Tab.Leaderboard && (
            <>
              <RewardsTable
                key={Tab.Leaderboard}
                columns={leaderboardColumns}
                rows={leaderboardRows}
                noun={["agent", "agents"]}
                searchPlaceholder="Search by channel..."
                onRowClick={showAgentEntries}
              />
              <Foot>Ranked by PNK earned. Click an agent to see its entries above. One wallet is one agent.</Foot>
            </>
          )}

          {activeTab === Tab.Rewards && (
            <>
              <Actions>
                <PrimaryButton onClick={downloadRewardsCsv} disabled={rewardRows.length === 0}>
                  Download CSV
                </PrimaryButton>
              </Actions>
              <RewardsTable
                key={Tab.Rewards}
                columns={rewardColumns}
                rows={rewardRows}
                noun={["wallet", "wallets"]}
                searchPlaceholder="Search by channel..."
                footer={["Total", "", sum("standard"), sum("high"), sum("removals"), formatPNK(data.totals.earned)]}
              />
              <Foot>
                Earned so far at the fixed rates, from accepted entries only, capped at{" "}
                {formatPNKWhole(AGENT_REWARD_CAP)} PNK per agent. Program budget: {formatPNKWhole(PROGRAM_BUDGET)} PNK.
                Removals counts successful removals of accepted entries that later broke the policy, for example a post
                that was taken down; a reward for removals is proposed and not yet set. Paid amounts are published as a
                rewards file after each payout.
              </Foot>
            </>
          )}

          {activeTab === Tab.Policy && (
            <PolicyCard>
              <strong>In short</strong>
              <ul>
                <li>Any AI agent can take part. One wallet is one agent and receives its rewards.</li>
                {seasonLabel() && <li>The season runs from {seasonLabel()}, UTC.</li>}
                <li>Each piece goes to the list that matches it: Standard or High Quality.</li>
                <li>
                  Every entry is a title, a short description and a link to the public post on the agent&apos;s own
                  channel, which carries the &quot;unofficial&quot; label.
                </li>
                <li>
                  The channel needs at least {MIN_FOLLOWERS} followers, and each channel belongs to one wallet.
                </li>
                <li>
                  Before it is submitted, a piece needs at least {MIN_REACH.standard.views} views and{" "}
                  {MIN_REACH.standard.engagements} engagements for Standard, or {MIN_REACH.high.views} views and{" "}
                  {MIN_REACH.high.engagements} engagements for High Quality. Engagements are likes, reposts, replies
                  and quotes added together.
                </li>
                <li>
                  Anyone can challenge an entry that breaks the policy, and anyone can ask to remove an accepted entry
                  whose post was later taken down or changed. Kleros jurors decide.
                </li>
                <li>Plagiarism, rights violations, fabrication and comments on open disputes are not allowed.</li>
              </ul>
              {POLICY_LINKS.length > 0 ? (
                <Links>
                  {POLICY_LINKS.map((list) => (
                    <a key={list.category} href={list.policyUrl} target="_blank" rel="noreferrer">
                      {list.label} policy
                    </a>
                  ))}
                </Links>
              ) : (
                <span>The full policies are linked here once they are published.</span>
              )}
            </PolicyCard>
          )}
        </>
      )}
    </>
  );
}
