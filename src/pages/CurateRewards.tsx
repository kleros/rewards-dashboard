import { useMemo, useState } from "react";
import styled from "styled-components";

import { PrimaryButton, SecondaryButton } from "components/Buttons";
import ErrorState from "components/ErrorState";
import FetchProgress from "components/FetchProgress";
import PageHeader from "components/PageHeader";
import RewardsTable, { Column, Mono, Row } from "components/RewardsTable";
import {
  BackRow,
  DetailCard,
  DetailHead,
  Foot,
  GrandTotal,
  LinesTable,
  MutedLabel,
  NumCell,
  PeriodBlock,
} from "components/rewardStyles";
import StatsRow, { Stat } from "components/StatsRow";
import Tabs from "components/Tabs";
import {
  CurateData,
  CuratePeriod,
  CurateSnapshot,
  RewardLine,
  sumLines,
  useCurateRewards,
} from "hooks/useCurateRewards";
import { downloadBlob, formatPNK, shortAddress, toCsv, toWei } from "utils/format";

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

// Prefer the published entryCounts (amended snapshots, 2026-07-20). For
// snapshots without it, fall back to counting itemized reward lines — but
// aggregate lump lines (empty registry/tagAddress) are not entries, so any
// snapshot containing one reports null rather than a misleading line count.
function countEntries(snapshot: CurateSnapshot, category: "total" | "submissions" = "total"): number | null {
  const published = snapshot.entryCounts?.[category];
  if (typeof published === "number" && Number.isFinite(published)) return published;
  if (snapshot.entryCounts) return null;
  let count = 0;
  for (const recipient of Object.values(snapshot.recipients ?? {})) {
    const categories =
      category === "total" ? [recipient.submissions, recipient.removals, recipient.atq] : [recipient.submissions];
    for (const lines of categories) {
      for (const line of lines ?? []) {
        if (!line.registry && !line.tagAddress) return null;
        count++;
      }
    }
  }
  return count;
}

function avgWei(total: bigint, count: number | null): bigint | null {
  return count && count > 0 ? total / BigInt(count) : null;
}

function monthlyRows(data: CurateData): Row[] {
  return data.periods.map(({ label, snapshot }) => {
    const totals = snapshot.totals ?? {};
    const submissions = toWei(totals.submissions);
    return {
      month: label,
      entries: BigInt(countEntries(snapshot) ?? -1),
      submissions,
      avgSubmission: avgWei(submissions, countEntries(snapshot, "submissions")) ?? -1n,
      removals: toWei(totals.removals),
      atq: toWei(totals.atq),
      total: toWei(totals.total),
    };
  });
}

function scopeStats(tab: string, data: CurateData): Stat[] {
  let stats: {
    first: Stat;
    recipients: number;
    entries?: number | null;
    submissions: bigint;
    avgSubmission: bigint | null;
    removals: bigint;
    atq: bigint;
    total: bigint;
  };
  if (tab === SUMMARY || tab === MONTHLY) {
    let submissions = 0n;
    let removals = 0n;
    let atq = 0n;
    for (const g of Object.values(data.grandTotals)) {
      submissions += g.submissions;
      removals += g.removals;
      atq += g.atq;
    }
    // The all-time average is only honest if every period's denominator is
    // known; a single unrecoverable count degrades it to "—".
    let submissionCount: number | null = 0;
    for (const { snapshot } of data.periods) {
      const count = countEntries(snapshot, "submissions");
      if (count === null) {
        submissionCount = null;
        break;
      }
      submissionCount += count;
    }
    stats = {
      first: { label: "Periods", value: String(data.periods.length) },
      recipients: Object.keys(data.grandTotals).length,
      submissions,
      avgSubmission: avgWei(submissions, submissionCount),
      removals,
      atq,
      total: submissions + removals + atq,
    };
  } else {
    const snapshot = data.periods.find((p) => p.label === tab)?.snapshot ?? {};
    const totals = snapshot.totals ?? {};
    const submissions = toWei(totals.submissions);
    stats = {
      first: { label: "Period", value: tab },
      recipients: Object.keys(snapshot.recipients ?? {}).length,
      entries: countEntries(snapshot),
      submissions,
      avgSubmission: avgWei(submissions, countEntries(snapshot, "submissions")),
      removals: toWei(totals.removals),
      atq: toWei(totals.atq),
      total: toWei(totals.total),
    };
  }
  // Context (ending on the headline total) before the per-category breakdown,
  // so the total never lands in a trailing wrap row.
  return [
    stats.first,
    { label: "Recipients", value: stats.recipients.toLocaleString() },
    ...(stats.entries === undefined
      ? []
      : [{ label: "Entries", value: stats.entries === null ? "—" : stats.entries.toLocaleString() }]),
    { label: "Total distributed", value: `${formatPNK(stats.total)} PNK` },
    { label: "Submission rewards", value: `${formatPNK(stats.submissions)} PNK` },
    {
      label: "Avg reward per submission",
      value: stats.avgSubmission === null ? "—" : `${formatPNK(stats.avgSubmission)} PNK`,
    },
    { label: "Removal rewards", value: `${formatPNK(stats.removals)} PNK` },
    { label: "ATQ rewards", value: `${formatPNK(stats.atq)} PNK` },
  ];
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

function monthlyColumns(): Column[] {
  return [
    { key: "month", label: "Month", align: "left" },
    {
      key: "entries",
      label: "Entries",
      align: "right",
      render: (row) => ((row.entries as bigint) < 0n ? "—" : Number(row.entries).toLocaleString()),
    },
    { key: "submissions", label: "Submission rewards", align: "right" },
    {
      key: "avgSubmission",
      label: "Avg reward / submission",
      align: "right",
      render: (row) => ((row.avgSubmission as bigint) < 0n ? "—" : formatPNK(row.avgSubmission as bigint)),
    },
    { key: "removals", label: "Removal rewards", align: "right" },
    { key: "atq", label: "ATQ rewards", align: "right" },
    { key: "total", label: "Total (PNK)", align: "right" },
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
                  <tbody>
                    {lines.map((line, i) => (
                      <tr key={i}>
                        <td>
                          <Pill $kind={line.kind}>{kindLabel[line.kind]}</Pill>
                        </td>
                        <td>{registryLabel(line.registry)}</td>
                        <td>
                          <MutedLabel as="span">{line.chainName ?? line.chain ?? ""}</MutedLabel>
                        </td>
                        <td>
                          <Mono title={line.tagAddress}>{shortAddress(line.tagAddress ?? "")}</Mono>
                        </td>
                        <NumCell>{formatPNK(toWei(line.amount))} PNK</NumCell>
                      </tr>
                    ))}
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
  const { phase, progress, errors, data, retry } = useCurateRewards();
  const [activeTab, setActiveTab] = useState(MONTHLY);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  const tabs = useMemo(() => (data ? [MONTHLY, SUMMARY, ...data.periods.map((p) => p.label)] : [MONTHLY, SUMMARY]), [data]);

  const isMonthly = activeTab === MONTHLY;

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    if (isMonthly) return monthlyRows(data);
    if (activeTab === SUMMARY) return grandRows(data);
    return walletRows(data.periods.find((p) => p.label === activeTab)?.snapshot ?? {});
  }, [data, activeTab, isMonthly]);

  function selectTab(tab: string) {
    setSelectedAddress(null);
    setActiveTab(tab);
  }

  function downloadCsv() {
    const header = [
      isMonthly ? "Month" : "Recipient",
      ...(isMonthly ? ["Entries"] : []),
      "Submissions (PNK)",
      ...(isMonthly ? ["Avg reward per submission (PNK)"] : []),
      "Removals (PNK)",
      "ATQ (PNK)",
      "Total (PNK)",
    ];
    const body = rows.map((row) => [
      String(isMonthly ? row.month : row.addr),
      ...(isMonthly ? [(row.entries as bigint) < 0n ? "" : String(row.entries)] : []),
      formatPNK(row.submissions as bigint),
      ...(isMonthly
        ? [(row.avgSubmission as bigint) < 0n ? "" : formatPNK(row.avgSubmission as bigint)]
        : []),
      formatPNK(row.removals as bigint),
      formatPNK(row.atq as bigint),
      formatPNK(row.total as bigint),
    ]);
    downloadBlob(
      new Blob([toCsv([header, ...body])], { type: "text/csv" }),
      `curate-rewards-${activeTab.replace(/\s+/g, "-").toLowerCase()}.csv`
    );
  }

  return (
    <div>
      <PageHeader
        title="Curate Rewards"
        description="Monthly PNK rewards for submissions, removals and ATQ across the Address Tags, Tokens and Domains registries. Amounts are on-chain PNK on Gnosis, disbursed directly to recipients."
        actions={phase === "done" && <PrimaryButton onClick={downloadCsv}>Download CSV</PrimaryButton>}
      />

      {phase === "fetching" && <FetchProgress title="Fetching reward periods from IPFS..." progress={progress} />}

      {phase === "error" && <ErrorState message={errors[0] ?? "Could not load the reward index."} onRetry={retry} />}

      {phase === "done" && data && (
        <>
          <StatsRow stats={scopeStats(activeTab, data)} />
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
              columns={isMonthly ? monthlyColumns() : walletColumns()}
              rows={rows}
              defaultSortKey={isMonthly ? "month" : undefined}
              noun={isMonthly ? ["month", "months"] : ["recipient", "recipients"]}
              searchPlaceholder={isMonthly ? "Search month…" : "Search by wallet address (0x…)"}
              onRowClick={
                isMonthly
                  ? (row) => selectTab(String(row.month))
                  : (row) => setSelectedAddress(String(row.addr).toLowerCase())
              }
            />
          )}
          <Foot>
            Data from {data.periods.length} period(s)
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
