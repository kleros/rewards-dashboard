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

function monthlyRows(data: CurateData): Row[] {
  return data.periods.map(({ label, snapshot }) => {
    const totals = snapshot.totals ?? {};
    return {
      month: label,
      submissions: toWei(totals.submissions),
      removals: toWei(totals.removals),
      atq: toWei(totals.atq),
      total: toWei(totals.total),
    };
  });
}

function scopeStats(tab: string, data: CurateData): Stat[] {
  let stats: { first: Stat; recipients: number; submissions: bigint; removals: bigint; atq: bigint; total: bigint };
  if (tab === SUMMARY || tab === MONTHLY) {
    let submissions = 0n;
    let removals = 0n;
    let atq = 0n;
    for (const g of Object.values(data.grandTotals)) {
      submissions += g.submissions;
      removals += g.removals;
      atq += g.atq;
    }
    stats = {
      first: { label: "Periods", value: String(data.periods.length) },
      recipients: Object.keys(data.grandTotals).length,
      submissions,
      removals,
      atq,
      total: submissions + removals + atq,
    };
  } else {
    const snapshot = data.periods.find((p) => p.label === tab)?.snapshot ?? {};
    const totals = snapshot.totals ?? {};
    stats = {
      first: { label: "Period", value: tab },
      recipients: Object.keys(snapshot.recipients ?? {}).length,
      submissions: toWei(totals.submissions),
      removals: toWei(totals.removals),
      atq: toWei(totals.atq),
      total: toWei(totals.total),
    };
  }
  return [
    stats.first,
    { label: "Recipients", value: stats.recipients.toLocaleString() },
    { label: "Submission rewards", value: `${formatPNK(stats.submissions)} PNK` },
    { label: "Removal rewards", value: `${formatPNK(stats.removals)} PNK` },
    { label: "ATQ rewards", value: `${formatPNK(stats.atq)} PNK` },
    { label: "Total distributed", value: `${formatPNK(stats.total)} PNK` },
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
    { key: "submissions", label: "Submission rewards", align: "right" },
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
      "Submissions (PNK)",
      "Removals (PNK)",
      "ATQ (PNK)",
      "Total (PNK)",
    ];
    const body = rows.map((row) => [
      String(isMonthly ? row.month : row.addr),
      formatPNK(row.submissions as bigint),
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
