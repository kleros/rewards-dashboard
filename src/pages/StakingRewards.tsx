import { useMemo, useState } from "react";
import styled, { useTheme } from "styled-components";
import * as XLSX from "xlsx";

import AddressCell from "components/AddressCell";
import { PrimaryButton } from "components/Buttons";
import ErrorState from "components/ErrorState";
import FetchProgress from "components/FetchProgress";
import { StakingOverview, StakingToDate } from "components/overview/StakingOverview";
import PageHeader from "components/PageHeader";
import RewardsTable, { Column, Row } from "components/RewardsTable";
import StatsRow, { Stat } from "components/StatsRow";
import { BAR_MAX_WIDTH, Bar, BarNum, BarWrap } from "components/TableCells";
import Tabs from "components/Tabs";
import { StakingData, StakingMonthBucket, useStakingRewards } from "hooks/useStakingRewards";
import {
  downloadBlob,
  formatDuration,
  formatMonthsStat,
  formatPNK,
  monthSpan,
  toPnkNumber,
} from "utils/format";

const MONTHLY = "Monthly Totals";
const SUMMARY = "Summary";

const ErrorBanner = styled.div`
  margin-top: 12px;
  padding: 8px 14px;
  font-size: 12px;
  color: ${({ theme }) => theme.error};
  background: ${({ theme }) => theme.errorLight};
  border: 1px solid ${({ theme }) => theme.error}33;
  border-radius: 9px;
`;

function monthTotalRow(label: string, bucket: StakingMonthBucket): Row {
  let mainnet = 0n;
  let gnosis = 0n;
  for (const amount of Object.values(bucket.mainnet)) mainnet += amount;
  for (const amount of Object.values(bucket.gnosis)) gnosis += amount;
  return { Month: label, "Mainnet (PNK)": mainnet, "Gnosis (PNK)": gnosis, "Total (PNK)": mainnet + gnosis };
}

function monthWalletRows(bucket: StakingMonthBucket): Row[] {
  const addrs = new Set([...Object.keys(bucket.mainnet), ...Object.keys(bucket.gnosis)]);
  return [...addrs].map((addr) => {
    const mainnet = bucket.mainnet[addr] ?? 0n;
    const gnosis = bucket.gnosis[addr] ?? 0n;
    return { Recipient: addr, "Mainnet (PNK)": mainnet, "Gnosis (PNK)": gnosis, "Total (PNK)": mainnet + gnosis };
  });
}

function summaryRows(data: StakingData): Row[] {
  return Object.entries(data.grandTotals).map(([addr, totals]) => ({
    Recipient: addr,
    "Mainnet (PNK)": totals.mainnet,
    "Gnosis (PNK)": totals.gnosis,
    "Total (PNK)": totals.mainnet + totals.gnosis,
  }));
}

// Stat cards for the current scope: all periods on Monthly Totals/Summary,
// a single month on a month tab — mirrors the Curate page.
function scopeStats(tab: string, data: StakingData): Stat[] {
  let first: Stat;
  let recipients: number;
  let mainnet = 0n;
  let gnosis = 0n;
  if (tab === MONTHLY || tab === SUMMARY) {
    // Count distributions, not calendar months: the first bucket combined
    // Jan+Feb 2021, so the two figures differ by one, and every other count
    // on the page (badge, overview, table footer) is a distribution count —
    // a calendar-month count here would read as an off-by-one typo next to
    // the badge. The calendar span goes in the "(over ...)" suffix instead.
    first = {
      label: "Months",
      value: formatMonthsStat(
        data.months.length,
        data.months.length > 0 ? monthSpan(data.months[data.months.length - 1], data.months[0]) : null
      ),
    };
    recipients = Object.keys(data.grandTotals).length;
    for (const totals of Object.values(data.grandTotals)) {
      mainnet += totals.mainnet;
      gnosis += totals.gnosis;
    }
  } else {
    const bucket = data.monthData[tab] ?? { mainnet: {}, gnosis: {} };
    first = { label: "Month", value: tab };
    recipients = new Set([...Object.keys(bucket.mainnet), ...Object.keys(bucket.gnosis)]).size;
    for (const amount of Object.values(bucket.mainnet)) mainnet += amount;
    for (const amount of Object.values(bucket.gnosis)) gnosis += amount;
  }
  return [
    first,
    { label: "Recipients", value: recipients.toLocaleString() },
    { label: "Mainnet rewards", value: `${formatPNK(mainnet)} PNK` },
    { label: "Gnosis rewards", value: `${formatPNK(gnosis)} PNK` },
    { label: "Total distributed", value: `${formatPNK(mainnet + gnosis)} PNK` },
  ];
}

function pnkColumns(firstKey: string, lastKey: string): Column[] {
  const dimZero = (key: string) => (row: Row) => ((row[key] as bigint) === 0n ? "—" : formatPNK(row[key] as bigint));
  return [
    {
      key: firstKey,
      label: firstKey,
      align: "left",
      render: firstKey === "Recipient" ? (row) => <AddressCell address={String(row[firstKey])} /> : undefined,
    },
    { key: "Mainnet (PNK)", label: "Mainnet (PNK)", align: "right", render: dimZero("Mainnet (PNK)") },
    { key: "Gnosis (PNK)", label: "Gnosis (PNK)", align: "right", render: dimZero("Gnosis (PNK)") },
    { key: lastKey, label: lastKey, align: "right" },
  ];
}

// The Monthly Totals tab additionally gets a proportional bar beside the total.
function monthlyColumns(maxTotal: bigint, barColor: string): Column[] {
  const columns = pnkColumns("Month", "Total (PNK)");
  columns[columns.length - 1] = {
    key: "Total (PNK)",
    label: "Total paid",
    align: "right",
    render: (row) => (
      <BarWrap>
        <Bar
          $width={maxTotal > 0n ? (toPnkNumber(row["Total (PNK)"] as bigint) / toPnkNumber(maxTotal)) * BAR_MAX_WIDTH : 0}
          $color={barColor}
        />
        <BarNum>{formatPNK(row["Total (PNK)"] as bigint)}</BarNum>
      </BarWrap>
    ),
  };
  return columns;
}

// XLSX cells hold plain numbers (PNK rounded to 2 decimals), like the original page.
function exportRows(rows: Row[], sortDescBy: string): Record<string, string | number>[] {
  return [...rows]
    .sort((a, b) => {
      const va = a[sortDescBy];
      const vb = b[sortDescBy];
      return typeof va === "bigint" && typeof vb === "bigint" ? (vb < va ? -1 : vb > va ? 1 : 0) : 0;
    })
    .map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "bigint" ? toPnkNumber(value) : value]))
    );
}

function addSheet(wb: XLSX.WorkBook, name: string, rows: Record<string, string | number>[], widths: number[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

function downloadXlsx(data: StakingData) {
  const wb = XLSX.utils.book_new();
  addSheet(
    wb,
    "Monthly Totals",
    data.months.map((label) => {
      const row = monthTotalRow(label, data.monthData[label]);
      return Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, typeof value === "bigint" ? toPnkNumber(value) : value])
      );
    }),
    [14, 18, 18, 18]
  );
  addSheet(wb, "Summary", exportRows(summaryRows(data), "Total (PNK)"), [44, 20, 20, 20]);
  for (const label of data.months) {
    const rows = monthWalletRows(data.monthData[label]);
    if (rows.length === 0) continue;
    addSheet(wb, label, exportRows(rows, "Total (PNK)"), [44, 18, 18, 18]);
  }
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "staking-rewards.xlsx"
  );
}

export default function StakingRewards() {
  const theme = useTheme();
  const { phase, progress, errors, data, retry } = useStakingRewards();
  const [activeTab, setActiveTab] = useState(MONTHLY);
  // Search survives tab switches, held here because the table remounts per
  // tab. Two states because the semantic differs: recipient tabs (Summary and
  // each month) search addresses, the Monthly Totals tab searches month labels.
  const [recipientSearch, setRecipientSearch] = useState("");
  const [monthSearch, setMonthSearch] = useState("");

  const tabs = useMemo(() => (data ? [MONTHLY, SUMMARY, ...data.months] : [MONTHLY, SUMMARY]), [data]);

  const isMonthly = activeTab === MONTHLY;

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    if (activeTab === MONTHLY) return data.months.map((label) => monthTotalRow(label, data.monthData[label]));
    if (activeTab === SUMMARY) return summaryRows(data);
    return monthWalletRows(data.monthData[activeTab] ?? { mainnet: {}, gnosis: {} });
  }, [data, activeTab]);

  const monthly = useMemo(() => {
    if (!data || !isMonthly) return null;
    let mainnet = 0n;
    let gnosis = 0n;
    let maxTotal = 0n;
    for (const row of rows) {
      mainnet += row["Mainnet (PNK)"] as bigint;
      gnosis += row["Gnosis (PNK)"] as bigint;
      const total = row["Total (PNK)"] as bigint;
      if (total > maxTotal) maxTotal = total;
    }
    // "Distributions", not "months": the combined 2021-01 & 02 row is one
    // distribution covering two calendar months.
    const footer = [
      `All ${rows.length} distributions`,
      formatPNK(mainnet),
      formatPNK(gnosis),
      formatPNK(mainnet + gnosis),
    ];
    return { maxTotal, footer };
  }, [data, isMonthly, rows]);

  const columns = useMemo(() => {
    if (isMonthly && monthly) return monthlyColumns(monthly.maxTotal, theme.seriesA);
    return pnkColumns("Recipient", "Total (PNK)");
  }, [isMonthly, monthly, theme]);

  const badge = useMemo(() => {
    if (!data || data.months.length === 0) return undefined;
    const span = monthSpan(data.months[data.months.length - 1], data.months[0]);
    return `${span === null ? "" : `Running ${formatDuration(span)} · `}${data.months.length} monthly distributions`;
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Staking Rewards"
        badge={phase === "done" ? badge : undefined}
        description={
          <>
            Jurors who <strong>stake PNK in Kleros Court</strong> earn monthly staking rewards on top of arbitration
            fees, split in proportion to each juror's stake. Rewards are{" "}
            <strong>on-chain PNK on Ethereum Mainnet and Gnosis</strong>, reconstructed from the merkle-drop snapshots
            the court publishes to IPFS.
          </>
        }
        actions={
          phase === "done" &&
          data && <PrimaryButton onClick={() => downloadXlsx(data)}>Download XLSX</PrimaryButton>
        }
      />

      {phase === "fetching" && <FetchProgress title="Fetching reward data from IPFS..." progress={progress} />}

      {phase === "error" && (
        <ErrorState message={errors[0] ?? "Could not load the reward data."} onRetry={retry} />
      )}

      {phase === "done" && data && (
        <>
          {isMonthly ? <StakingOverview data={data} /> : <StatsRow stats={scopeStats(activeTab, data)} />}
          <Tabs
            tabs={tabs}
            active={activeTab}
            onSelect={(tab) => setActiveTab(tab)}
          />
          <RewardsTable
            key={activeTab}
            columns={columns}
            rows={rows}
            defaultSortKey={isMonthly ? "Month" : undefined}
            noun={isMonthly ? ["distribution", "distributions"] : ["recipient", "recipients"]}
            searchPlaceholder={isMonthly ? "Search month…" : "Search by wallet address (0x…)"}
            search={isMonthly ? monthSearch : recipientSearch}
            onSearchChange={isMonthly ? setMonthSearch : setRecipientSearch}
            footer={isMonthly && monthly ? monthly.footer : undefined}
            onRowClick={isMonthly ? (row) => setActiveTab(String(row.Month)) : undefined}
          />
          {isMonthly && <StakingToDate data={data} />}
          {errors.length > 0 && (
            <ErrorBanner>
              {errors.length} snapshot{errors.length > 1 ? "s" : ""} failed to load and {errors.length > 1 ? "were" : "was"} skipped.
            </ErrorBanner>
          )}
        </>
      )}
    </div>
  );
}
