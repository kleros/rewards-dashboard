import { useMemo, useState } from "react";
import styled, { useTheme } from "styled-components";

import { PrimaryButton, SecondaryButton } from "components/Buttons";
import ErrorState from "components/ErrorState";
import FetchProgress from "components/FetchProgress";
import { CurateOverview, CurateToDate } from "components/overview/CurateOverview";
import { HeatRamp, HeatScale } from "components/overview/OverviewSections";
import PageHeader from "components/PageHeader";
import RewardsTable, { Column, Mono, Row } from "components/RewardsTable";
import {
  BackRow,
  DetailCard,
  DetailHead,
  Foot,
  GrandTotal,
  LINES_COLS,
  LinesTable,
  MutedLabel,
  NumCell,
  PeriodBlock,
} from "components/rewardStyles";
import StatsRow, { Stat } from "components/StatsRow";
import { BAR_MAX_WIDTH, Bar, BarNum, BarWrap, HeatVal, makeHeat } from "components/TableCells";
import TagAddress from "components/TagAddress";
import Tabs from "components/Tabs";
import {
  CurateData,
  CuratePeriod,
  CurateSnapshot,
  RewardLine,
  avgWei,
  countEntries,
  countTotalEntries,
  sumLines,
  useCurateRewards,
} from "hooks/useCurateRewards";
import {
  downloadBlob,
  formatDuration,
  formatMonthsStat,
  formatPNK,
  monthSpan,
  shortAddress,
  toCsv,
  toPnkNumber,
  toWei,
} from "utils/format";

const SUMMARY = "Summary";
const MONTHLY = "Monthly Totals";

const Pill = styled.span<{ $kind: "sub" | "rem" | "atq" }>`
  display: inline-block;
  padding: 1px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme, $kind }) =>
    $kind === "sub" ? theme.primaryBlue : $kind === "rem" ? theme.tint : theme.secondaryPurple};
  background: ${({ theme, $kind }) =>
    `${$kind === "sub" ? theme.primaryBlue : $kind === "rem" ? theme.tint : theme.secondaryPurple}22`};
`;


function registryLabel(registry: string | undefined): string {
  switch (registry) {
    case "addressTags":
      return "Address Tags";
    case "tokens":
      return "Kleros Tokens";
    case "domains":
      return "Domains";
    case "atq":
      return "ATQ";
    default:
      return registry ?? "";
  }
}

function walletRows(snapshot: CurateSnapshot): Row[] {
  return Object.entries(snapshot.recipients ?? {}).map(([addr, recipient]) => {
    const submissions = sumLines(recipient.submissions);
    const removals = sumLines(recipient.removals);
    const atq = sumLines(recipient.atq);
    return { addr, submissions, removals, atq, total: submissions + removals + atq };
  });
}

function grandRows(data: CurateData): Row[] {
  return Object.entries(data.grandTotals).map(([addr, totals]) => ({ addr, ...totals }));
}

function monthlyRows(data: CurateData): Row[] {
  return data.periods.map(({ label, snapshot }) => {
    const totals = snapshot.totals ?? {};
    const submissions = toWei(totals.submissions);
    const entryTotal = countTotalEntries(snapshot);
    return {
      month: label,
      entries: BigInt(entryTotal?.value ?? -1),
      // "+" marks a floor: some category counts are unrecoverable (2024-10's
      // aggregate ATQ payment), so the true total is at least this.
      entriesSuffix: entryTotal && !entryTotal.exact ? "+" : "",
      submissions,
      avgSubmission: avgWei(submissions, countEntries(snapshot, "submissions")) ?? -1n,
      removals: toWei(totals.removals),
      atq: toWei(totals.atq),
      total: toWei(totals.total),
    };
  });
}

// Per-category rewards and averages — the second stats row in every scope.
function breakdownStats(s: {
  submissions: bigint;
  avgSubmission: bigint | null;
  removals: bigint;
  avgRemoval: bigint | null;
  atq: bigint;
}): Stat[] {
  return [
    { label: "Submission rewards", value: `${formatPNK(s.submissions)} PNK` },
    {
      label: "Avg reward per submission",
      value: s.avgSubmission === null ? "—" : `${formatPNK(s.avgSubmission)} PNK`,
    },
    { label: "Removal rewards", value: `${formatPNK(s.removals)} PNK` },
    // Removals only exist since 2025-08 — hide the average (rather than
    // showing "—") for the many periods where there is nothing to average.
    ...(s.avgRemoval === null
      ? []
      : [{ label: "Avg reward per removal", value: `${formatPNK(s.avgRemoval)} PNK` }]),
    { label: "ATQ rewards", value: `${formatPNK(s.atq)} PNK` },
  ];
}

function summaryStats(data: CurateData): Stat[] {
  let submissions = 0n;
  let removals = 0n;
  let atq = 0n;
  for (const g of Object.values(data.grandTotals)) {
    submissions += g.submissions;
    removals += g.removals;
    atq += g.atq;
  }
  const total = submissions + removals + atq;
  // The all-time averages are only honest if every period's denominator is
  // known; a single unrecoverable count degrades them to "—"/hidden.
  let submissionCount: number | null = 0;
  let removalCount: number | null = 0;
  for (const { snapshot } of data.periods) {
    const subs = countEntries(snapshot, "submissions");
    const rems = countEntries(snapshot, "removals");
    if (submissionCount !== null) submissionCount = subs === null ? null : submissionCount + subs;
    if (removalCount !== null) removalCount = rems === null ? null : removalCount + rems;
  }
  // "Months" counts rewarded months, not calendar months (rewards skipped
  // 2023-07/08). The last-12 card only renders when the newest 12 loaded
  // periods really are 12 consecutive calendar months — a failed fetch in
  // that window (or a future index gap) would otherwise silently shift it.
  const months = data.periods.length;
  // Rewarded months can span more calendar months than were paid (skipped
  // months) — formatMonthsStat keeps the count and span distinct.
  const span = months > 0 ? monthSpan(data.periods[months - 1].label, data.periods[0].label) : null;
  const newest12 = data.periods.slice(0, 12);
  const monthIndex = (label: string): number | null => {
    const match = label.match(/^(\d{4})-(\d{2})$/);
    return match ? Number(match[1]) * 12 + Number(match[2]) : null;
  };
  const indexes = newest12.map((p) => monthIndex(p.label));
  const last12Contiguous =
    months > 12 &&
    indexes.every((idx, i) => idx !== null && (i === 0 || (indexes[i - 1] ?? 0) - idx === 1));
  const last12 = newest12.reduce((sum, { snapshot }) => {
    for (const r of Object.values(snapshot.recipients ?? {}))
      sum += sumLines(r.submissions) + sumLines(r.removals) + sumLines(r.atq);
    return sum;
  }, 0n);
  return [
    // "Months rewarded", because two calendar months inside the window
    // (2023-07/08) had no distribution — the "(over …)" span says so.
    { label: "Months", value: formatMonthsStat(months, span) },
    { label: "Recipients", value: Object.keys(data.grandTotals).length.toLocaleString() },
    {
      label: `Total distributed (${months} rewarded month${months === 1 ? "" : "s"})`,
      value: `${formatPNK(total)} PNK`,
    },
    ...(last12Contiguous ? [{ label: "Total (last 12 months)", value: `${formatPNK(last12)} PNK` }] : []),
    { label: "Avg per month", value: `${formatPNK(total / BigInt(months))} PNK` },
    ...breakdownStats({
      submissions,
      avgSubmission: avgWei(submissions, submissionCount),
      removals,
      avgRemoval: avgWei(removals, removalCount),
      atq,
    }),
  ];
}

function periodStats(tab: string, data: CurateData): Stat[] {
  const snapshot = data.periods.find((p) => p.label === tab)?.snapshot ?? {};
  const totals = snapshot.totals ?? {};
  const submissions = toWei(totals.submissions);
  const entries = countTotalEntries(snapshot);
  return [
    { label: "Month", value: tab },
    { label: "Recipients", value: Object.keys(snapshot.recipients ?? {}).length.toLocaleString() },
    {
      label: "Entries",
      value: entries === null ? "—" : `${entries.value.toLocaleString()}${entries.exact ? "" : "+"}`,
    },
    { label: "Total distributed", value: `${formatPNK(toWei(totals.total))} PNK` },
    ...breakdownStats({
      submissions,
      avgSubmission: avgWei(submissions, countEntries(snapshot, "submissions")),
      removals: toWei(totals.removals),
      avgRemoval: avgWei(toWei(totals.removals), countEntries(snapshot, "removals")),
      atq: toWei(totals.atq),
    }),
  ];
}

function scopeStats(tab: string, data: CurateData): Stat[] {
  return tab === SUMMARY || tab === MONTHLY ? summaryStats(data) : periodStats(tab, data);
}

function walletColumns(): Column[] {
  return [
    {
      key: "addr",
      label: "Recipient",
      align: "left",
      render: (row) => (
        <Mono title={String(row.addr)}>{shortAddress(String(row.addr))}</Mono>
      ),
    },
    { key: "submissions", label: "Submission rewards", align: "right" },
    { key: "removals", label: "Removal rewards", align: "right" },
    { key: "atq", label: "ATQ rewards", align: "right" },
    { key: "total", label: "Total (PNK)", align: "right" },
  ];
}

// Mock-ordered month-by-month columns: dimmed zeros, a single-hue heat wash
// on the per-submission average, and a proportional bar beside the total.
function monthlyColumns(heat: (value: number) => string, maxTotal: bigint, barColor: string): Column[] {
  const dimZero = (key: string) => (row: Row) => ((row[key] as bigint) === 0n ? "—" : formatPNK(row[key] as bigint));
  return [
    { key: "month", label: "Month", align: "left" },
    {
      key: "entries",
      label: "Entries",
      align: "right",
      render: (row) =>
        (row.entries as bigint) < 0n ? "—" : `${Number(row.entries).toLocaleString()}${row.entriesSuffix ?? ""}`,
    },
    { key: "submissions", label: "Submissions", align: "right" },
    { key: "removals", label: "Removals", align: "right", render: dimZero("removals") },
    { key: "atq", label: "ATQ", align: "right", render: dimZero("atq") },
    {
      key: "avgSubmission",
      label: "PNK / submission",
      align: "right",
      render: (row) =>
        (row.avgSubmission as bigint) < 0n ? (
          "—"
        ) : (
          <HeatVal $bg={heat(toPnkNumber(row.avgSubmission as bigint))}>{formatPNK(row.avgSubmission as bigint)}</HeatVal>
        ),
    },
    {
      key: "total",
      label: "Total paid",
      align: "right",
      render: (row) => (
        <BarWrap>
          <Bar
            $width={maxTotal > 0n ? (toPnkNumber(row.total as bigint) / toPnkNumber(maxTotal)) * BAR_MAX_WIDTH : 0}
            $color={barColor}
          />
          <BarNum>{formatPNK(row.total as bigint)}</BarNum>
        </BarWrap>
      ),
    },
  ];
}

interface WalletDetailProps {
  address: string;
  periods: CuratePeriod[];
  onBack: () => void;
}

function WalletDetail({ address, periods, onBack }: WalletDetailProps) {
  let grand = 0n;
  const blocks: { label: string; total: bigint; lines: (RewardLine & { kind: "sub" | "rem" | "atq" })[] }[] = [];
  for (const { label, snapshot } of periods) {
    const recipient = (snapshot.recipients ?? {})[address];
    if (!recipient) continue;
    const lines = [
      ...(recipient.submissions ?? []).map((line) => ({ ...line, kind: "sub" as const })),
      ...(recipient.removals ?? []).map((line) => ({ ...line, kind: "rem" as const })),
      ...(recipient.atq ?? []).map((line) => ({ ...line, kind: "atq" as const })),
    ];
    const total = sumLines(recipient.submissions) + sumLines(recipient.removals) + sumLines(recipient.atq);
    grand += total;
    blocks.push({ label, total, lines });
  }

  const kindLabel = { sub: "Submission", rem: "Removal", atq: "ATQ" };

  // ATQ lines carry the module's Curate status ("registered"/"removed") in
  // the chainName slot — it is not a chain, so don't display it as one.
  const chainLabel = (line: RewardLine): string => {
    const name = line.chainName ?? line.chain ?? "";
    return name === "registered" || name === "removed" ? "" : name;
  };

  return (
    <div>
      <BackRow>
        <SecondaryButton onClick={onBack}>← Back</SecondaryButton>
      </BackRow>
      <DetailCard>
        <DetailHead>
          <div>
            <MutedLabel>Rewards for</MutedLabel>
            <Mono style={{ fontSize: 14 }}>{address}</Mono>
          </div>
          <div style={{ textAlign: "right" }}>
            <MutedLabel>All-time total</MutedLabel>
            <GrandTotal>{formatPNK(grand)} PNK</GrandTotal>
          </div>
        </DetailHead>
        {blocks.length === 0 ? (
          <PeriodBlock>
            <h4>No rewards recorded for this address.</h4>
          </PeriodBlock>
        ) : (
          blocks.map(({ label, total, lines }) => (
            <PeriodBlock key={label}>
              <h4>
                {label} — {formatPNK(total)} PNK
              </h4>
              <div style={{ overflowX: "auto" }}>
                <LinesTable>
                  <colgroup>
                    {LINES_COLS.map((width, i) => (
                      <col key={i} style={{ width }} />
                    ))}
                  </colgroup>
                  <tbody>
                    {lines.map((line, i) =>
                      // Aggregate lump line: no per-item breakdown exists —
                      // whole months with unrecoverable tracking records, and
                      // old-style ATQ payments (one lump per provider, no
                      // module ids) — so say so instead of empty cells.
                      (!line.registry || line.registry === "atq") && !line.tagAddress ? (
                        <tr key={i}>
                          <td>
                            <Pill $kind={line.kind}>{kindLabel[line.kind]}</Pill>
                          </td>
                          <td colSpan={3}>
                            <MutedLabel as="span">
                              Aggregate reward — no itemized breakdown published for this month
                            </MutedLabel>
                          </td>
                          <NumCell>{formatPNK(toWei(line.amount))} PNK</NumCell>
                        </tr>
                      ) : (
                        <tr key={i}>
                          <td>
                            <Pill $kind={line.kind}>{kindLabel[line.kind]}</Pill>
                          </td>
                          <td>{registryLabel(line.registry)}</td>
                          <td>
                            <MutedLabel as="span">{chainLabel(line)}</MutedLabel>
                          </td>
                          <td>
                            <TagAddress address={line.tagAddress} chainName={chainLabel(line)} />
                          </td>
                          <NumCell>{formatPNK(toWei(line.amount))} PNK</NumCell>
                        </tr>
                      )
                    )}
                  </tbody>
                </LinesTable>
              </div>
            </PeriodBlock>
          ))
        )}
      </DetailCard>
    </div>
  );
}

export default function CurateRewards() {
  const theme = useTheme();
  const { phase, progress, errors, data, retry } = useCurateRewards();
  const [activeTab, setActiveTab] = useState(MONTHLY);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  // Search survives tab switches (and the wallet drill-down), held here
  // because the table remounts per tab. Two states because the semantic
  // differs: recipient tabs search addresses, Monthly Totals searches months.
  const [recipientSearch, setRecipientSearch] = useState("");
  const [monthSearch, setMonthSearch] = useState("");

  const tabs = useMemo(() => (data ? [MONTHLY, SUMMARY, ...data.periods.map((p) => p.label)] : [MONTHLY, SUMMARY]), [data]);

  const isMonthly = activeTab === MONTHLY;

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    if (isMonthly) return monthlyRows(data);
    if (activeTab === SUMMARY) return grandRows(data);
    return walletRows(data.periods.find((p) => p.label === activeTab)?.snapshot ?? {});
  }, [data, activeTab, isMonthly]);

  // Heat scale over the per-submission averages and bar scale over the month
  // totals — computed on the monthly rows, consumed by the table renders.
  const monthly = useMemo(() => {
    if (!data || !isMonthly) return null;
    const perSub = rows.filter((r) => (r.avgSubmission as bigint) >= 0n).map((r) => toPnkNumber(r.avgSubmission as bigint));
    const heat = makeHeat(Math.min(...perSub, Infinity), Math.max(...perSub, -Infinity), theme.seriesA);
    let maxTotal = 0n;
    let entriesSum = 0;
    let entriesExact = true;
    let entriesAnyKnown = false;
    let sub = 0n;
    let rem = 0n;
    let atq = 0n;
    let tot = 0n;
    let subEntries: number | null = 0;
    for (const { snapshot } of data.periods) {
      const count = countTotalEntries(snapshot);
      if (count === null) entriesExact = false;
      else {
        entriesAnyKnown = true;
        entriesSum += count.value;
        if (!count.exact) entriesExact = false;
      }
      const subCount = countEntries(snapshot, "submissions");
      if (subEntries !== null) subEntries = subCount === null ? null : subEntries + subCount;
      sub += toWei(snapshot.totals?.submissions);
      rem += toWei(snapshot.totals?.removals);
      atq += toWei(snapshot.totals?.atq);
      const total = toWei(snapshot.totals?.total);
      tot += total;
      if (total > maxTotal) maxTotal = total;
    }
    const overallAvg = avgWei(sub, subEntries);
    const footer = [
      `All ${data.periods.length} rewarded months`,
      entriesAnyKnown ? `${entriesSum.toLocaleString()}${entriesExact ? "" : "+"}` : "—",
      formatPNK(sub),
      formatPNK(rem),
      formatPNK(atq),
      overallAvg === null ? "—" : formatPNK(overallAvg),
      formatPNK(tot),
    ];
    return { heat, maxTotal, footer };
  }, [data, isMonthly, rows, theme]);

  function selectTab(tab: string) {
    setSelectedAddress(null);
    setActiveTab(tab);
  }

  function downloadCsv() {
    const header = [
      isMonthly ? "Month" : "Recipient",
      ...(isMonthly ? ["Entries"] : []),
      "Submission rewards (PNK)",
      "Removal rewards (PNK)",
      "ATQ rewards (PNK)",
      ...(isMonthly ? ["Avg reward per submission (PNK)"] : []),
      "Total (PNK)",
    ];
    const body = rows.map((row) => [
      String(isMonthly ? row.month : row.addr),
      ...(isMonthly ? [(row.entries as bigint) < 0n ? "" : `${row.entries}${row.entriesSuffix ?? ""}`] : []),
      formatPNK(row.submissions as bigint),
      formatPNK(row.removals as bigint),
      formatPNK(row.atq as bigint),
      ...(isMonthly
        ? [(row.avgSubmission as bigint) < 0n ? "" : formatPNK(row.avgSubmission as bigint)]
        : []),
      formatPNK(row.total as bigint),
    ]);
    downloadBlob(
      new Blob([toCsv([header, ...body])], { type: "text/csv" }),
      `curate-rewards-${activeTab.replace(/\s+/g, "-").toLowerCase()}.csv`
    );
  }

  const badge = useMemo(() => {
    if (!data || data.periods.length === 0) return undefined;
    const span = monthSpan(data.periods[data.periods.length - 1].label, data.periods[0].label);
    return `${span === null ? "" : `Running ${formatDuration(span)} · `}${data.periods.length} monthly distributions`;
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Curate Rewards"
        badge={phase === "done" ? badge : undefined}
        description={
          <>
            Kleros Curate pays independent contributors to build and maintain public registries of{" "}
            <strong>address tags, tokens and domains</strong>: the datasets wallets and explorers use to tell users
            what they are signing. Contributors submit entries, anyone can challenge them, and only entries that
            survive review are paid. Rewards are <strong>on-chain PNK on Gnosis</strong>, disbursed monthly, directly
            to recipients.
          </>
        }
        actions={phase === "done" && <PrimaryButton onClick={downloadCsv}>Download CSV</PrimaryButton>}
      />

      {phase === "fetching" && <FetchProgress title="Fetching reward data from IPFS..." progress={progress} />}

      {phase === "error" && <ErrorState message={errors[0] ?? "Could not load the reward data."} onRetry={retry} />}

      {phase === "done" && data && (
        <>
          {isMonthly ? <CurateOverview data={data} /> : <StatsRow stats={scopeStats(activeTab, data)} />}
          <Tabs tabs={tabs} active={activeTab} onSelect={selectTab} />
          {selectedAddress ? (
            <WalletDetail
              address={selectedAddress}
              periods={data.periods}
              onBack={() => setSelectedAddress(null)}
            />
          ) : (
            <RewardsTable
              key={activeTab}
              columns={
                isMonthly && monthly
                  ? monthlyColumns(monthly.heat.at, monthly.maxTotal, theme.seriesA)
                  : walletColumns()
              }
              rows={rows}
              defaultSortKey={isMonthly ? "month" : undefined}
              noun={isMonthly ? ["month", "months"] : ["recipient", "recipients"]}
              searchPlaceholder={isMonthly ? "Search month…" : "Search by wallet address (0x…)"}
              search={isMonthly ? monthSearch : recipientSearch}
              onSearchChange={isMonthly ? setMonthSearch : setRecipientSearch}
              footer={isMonthly && monthly ? monthly.footer : undefined}
              legend={
                isMonthly && monthly ? (
                  <HeatScale>
                    PNK per submission: lower
                    <HeatRamp>
                      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                        <i key={t} style={{ background: monthly.heat.atT(t) }} />
                      ))}
                    </HeatRamp>
                    higher
                  </HeatScale>
                ) : undefined
              }
              onRowClick={
                isMonthly
                  ? (row) => selectTab(String(row.month))
                  : (row) => setSelectedAddress(String(row.addr).toLowerCase())
              }
            />
          )}
          {isMonthly && <CurateToDate data={data} />}
          <Foot>
            Data from {data.periods.length} month(s)
            {errors.length > 0 ? ` · ${errors.length} snapshot(s) failed to load` : ""}.{" "}
            {isMonthly
              ? "Click a month to open its recipient table."
              : "Click a recipient to see the per-item breakdown."}
          </Foot>
        </>
      )}
    </div>
  );
}
