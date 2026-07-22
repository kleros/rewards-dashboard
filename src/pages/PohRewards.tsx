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
import { PohData, PohMonth, PohReward, usePohRewards } from "hooks/usePohRewards";
import { downloadBlob, formatPNK, shortAddress, toCsv } from "utils/format";

// The two fixed tabs. The remaining tabs are month labels ("2026-07"), which are
// dynamic strings — so `activeTab` is a string that is either a Tab value or a label.
enum Tab {
  Monthly = "Monthly Totals",
  Summary = "Summary",
}

// The airdrop is only paid on Gnosis, so the drill-down chain column is constant.
const CHAIN_LABEL = "Gnosis Chain";

const Pill = styled.span`
  display: inline-block;
  padding: 1px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.primaryBlue};
  background: ${({ theme }) => `${theme.primaryBlue}22`};
`;

// Render an ISO timestamp as a plain YYYY-MM-DD (empty for missing/invalid input).
function formatIsoDate(isoTimestamp: string | undefined): string {
  if (!isoTimestamp) return "";
  const date = new Date(isoTimestamp);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function perClaimAmount(totalWei: bigint, claimCount: number): bigint {
  return claimCount > 0 ? totalWei / BigInt(claimCount) : 0n;
}

function monthlyRows(data: PohData): Row[] {
  return data.months.map((month) => ({
    month: month.label,
    recipients: BigInt(month.recipients.length),
    total: month.total,
  }));
}

// One table row per reward — used for both the all-time Summary and each
// month's recipient table (they render the same recipient / humanity / total).
function rewardRows(rewards: PohReward[]): Row[] {
  return rewards.map((reward) => ({
    addr: reward.address,
    humanity: reward.humanityId,
    total: reward.amount,
  }));
}

function scopeStats(tab: string, data: PohData): Stat[] {
  // One claim per wallet, so the claim count is just the number of recipients.
  if (tab === Tab.Summary || tab === Tab.Monthly) {
    const total = data.recipients.reduce((sum, reward) => sum + reward.amount, 0n);
    return [
      { label: "Periods", value: String(data.months.length) },
      { label: "Humans rewarded", value: data.recipients.length.toLocaleString() },
      { label: "Total distributed", value: `${formatPNK(total)} PNK` },
      { label: "Per claim", value: `${formatPNK(perClaimAmount(total, data.recipients.length))} PNK` },
    ];
  }
  const month = data.months.find((candidate) => candidate.label === tab);
  const total = month?.total ?? 0n;
  const recipientCount = month?.recipients.length ?? 0;
  return [
    { label: "Period", value: tab },
    { label: "Humans rewarded", value: recipientCount.toLocaleString() },
    { label: "Total distributed", value: `${formatPNK(total)} PNK` },
    { label: "Per claim", value: `${formatPNK(perClaimAmount(total, recipientCount))} PNK` },
  ];
}

// A left-aligned column that renders its value as an ellipsized mono address.
function monoColumn(key: string, label: string): Column {
  return {
    key,
    label,
    align: "left",
    render: (row) => <Mono title={String(row[key])}>{shortAddress(String(row[key]))}</Mono>,
  };
}

function walletColumns(): Column[] {
  return [
    monoColumn("addr", "Recipient"),
    monoColumn("humanity", "Humanity ID"),
    { key: "total", label: "Total (PNK)", align: "right" },
  ];
}

function monthlyColumns(): Column[] {
  return [
    { key: "month", label: "Month", align: "left" },
    {
      key: "recipients",
      label: "Humans rewarded",
      align: "right",
      render: (row) => Number(row.recipients).toLocaleString(),
    },
    { key: "total", label: "PNK distributed", align: "right" },
  ];
}

interface WalletDetailProps {
  address: string;
  months: PohMonth[];
  onBack: () => void;
}

interface MonthBlock {
  label: string;
  reward: PohReward;
}

function WalletDetail({ address, months, onBack }: WalletDetailProps) {
  // The wallet claims once, so this is a single block — but iterating months
  // keeps it correct (and the all-time total right) without assuming just one.
  let allTimeTotal = 0n;
  const blocks: MonthBlock[] = [];
  for (const month of months) {
    const reward = month.recipients.find((candidate) => candidate.address === address);
    if (!reward) continue;
    allTimeTotal += reward.amount;
    blocks.push({ label: month.label, reward });
  }

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
            <GrandTotal>{formatPNK(allTimeTotal)} PNK</GrandTotal>
          </div>
        </DetailHead>
        {blocks.length === 0 ? (
          <PeriodBlock>
            <h4>No rewards recorded for this address.</h4>
          </PeriodBlock>
        ) : (
          blocks.map(({ label, reward }) => (
            <PeriodBlock key={label}>
              <h4>
                {label} — {formatPNK(reward.amount)} PNK
              </h4>
              <div style={{ overflowX: "auto" }}>
                <LinesTable>
                  <tbody>
                    <tr>
                      <td>
                        <Pill>Airdrop</Pill>
                      </td>
                      <td>
                        <MutedLabel as="span">{formatIsoDate(reward.claimedAt)}</MutedLabel>
                      </td>
                      <td>
                        <MutedLabel as="span">{CHAIN_LABEL}</MutedLabel>
                      </td>
                      <td>
                        <Mono title={reward.humanityId}>{shortAddress(reward.humanityId)}</Mono>
                      </td>
                      <NumCell>{formatPNK(reward.amount)} PNK</NumCell>
                    </tr>
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

export default function PohRewards() {
  const { phase, progress, errors, data, retry } = usePohRewards();
  const [activeTab, setActiveTab] = useState<string>(Tab.Monthly);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  const tabs = useMemo(
    () => (data ? [Tab.Monthly, Tab.Summary, ...data.months.map((month) => month.label)] : [Tab.Monthly, Tab.Summary]),
    [data]
  );

  const isMonthly = activeTab === Tab.Monthly;

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    if (isMonthly) return monthlyRows(data);
    if (activeTab === Tab.Summary) return rewardRows(data.recipients);
    return rewardRows(data.months.find((month) => month.label === activeTab)?.recipients ?? []);
  }, [data, activeTab, isMonthly]);

  function selectTab(tab: string) {
    setSelectedAddress(null);
    setActiveTab(tab);
  }

  function downloadCsv() {
    const header = isMonthly
      ? ["Month", "Humans rewarded", "Total (PNK)"]
      : ["Recipient", "Humanity ID", "Total (PNK)"];
    const body = rows.map((row) =>
      isMonthly
        ? [String(row.month), String(row.recipients), formatPNK(row.total as bigint)]
        : [String(row.addr), String(row.humanity), formatPNK(row.total as bigint)]
    );
    downloadBlob(
      new Blob([toCsv([header, ...body])], { type: "text/csv" }),
      `poh-rewards-${activeTab.replace(/\s+/g, "-").toLowerCase()}.csv`
    );
  }

  return (
    <div>
      <PageHeader
        title="Proof of Humanity Rewards"
        description="PNK airdrop claimed once per registered human in Proof of Humanity v2, paid on-chain on Gnosis through the PnkRewardDistributer since January 2026."
        actions={phase === "done" && <PrimaryButton onClick={downloadCsv}>Download CSV</PrimaryButton>}
      />

      {phase === "fetching" && <FetchProgress title="Fetching reward claims from the subgraph..." progress={progress} />}

      {phase === "error" && <ErrorState message={errors[0] ?? "Could not load the reward data."} onRetry={retry} />}

      {phase === "done" && data && (
        <>
          <StatsRow stats={scopeStats(activeTab, data)} />
          <Tabs tabs={tabs} active={activeTab} onSelect={selectTab} />
          {selectedAddress ? (
            <WalletDetail address={selectedAddress} months={data.months} onBack={() => setSelectedAddress(null)} />
          ) : (
            <RewardsTable
              // Remount on tab change so the table's internal sort, search and
              // page state reset to defaults for each tab.
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
            Data from {data.months.length} period(s), live from the PoH v2 subgraph.{" "}
            {isMonthly
              ? "Click a month to open its recipient table."
              : "Click a recipient to see their claim breakdown."}
          </Foot>
        </>
      )}
    </div>
  );
}
