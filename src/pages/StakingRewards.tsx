import { useMemo, useState } from "react";
import styled from "styled-components";
import * as XLSX from "xlsx";

import AddressCell from "components/AddressCell";
import { PrimaryButton } from "components/Buttons";
import ErrorState from "components/ErrorState";
import FetchProgress from "components/FetchProgress";
import PageHeader from "components/PageHeader";
import RewardsTable, { Column, Row } from "components/RewardsTable";
import Tabs from "components/Tabs";
import { StakingData, StakingMonthBucket, useStakingRewards } from "hooks/useStakingRewards";
import { downloadBlob, toPnkNumber } from "utils/format";

const MONTHLY = "Monthly Totals";
const SUMMARY = "Summary";

const HeaderMeta = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.secondaryText};
  white-space: nowrap;
`;

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
  return { Month: label, "Mainnet PNK": mainnet, "Gnosis PNK": gnosis, "Total PNK": mainnet + gnosis };
}

function monthWalletRows(bucket: StakingMonthBucket): Row[] {
  const addrs = new Set([...Object.keys(bucket.mainnet), ...Object.keys(bucket.gnosis)]);
  return [...addrs].map((addr) => {
    const mainnet = bucket.mainnet[addr] ?? 0n;
    const gnosis = bucket.gnosis[addr] ?? 0n;
    return { Address: addr, "Mainnet PNK": mainnet, "Gnosis PNK": gnosis, "Total PNK": mainnet + gnosis };
  });
}

function summaryRows(data: StakingData): Row[] {
  return Object.entries(data.grandTotals).map(([addr, totals]) => ({
    Address: addr,
    "Mainnet PNK": totals.mainnet,
    "Gnosis PNK": totals.gnosis,
    "Grand Total": totals.mainnet + totals.gnosis,
  }));
}

function pnkColumns(firstKey: string, lastKey: string): Column[] {
  return [
    {
      key: firstKey,
      label: firstKey,
      align: "left",
      render: firstKey === "Address" ? (row) => <AddressCell address={String(row[firstKey])} /> : undefined,
    },
    { key: "Mainnet PNK", label: "Mainnet PNK", align: "right" },
    { key: "Gnosis PNK", label: "Gnosis PNK", align: "right" },
    { key: lastKey, label: lastKey, align: "right" },
  ];
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
  addSheet(wb, "Summary", exportRows(summaryRows(data), "Grand Total"), [44, 20, 20, 20]);
  for (const label of data.months) {
    const rows = monthWalletRows(data.monthData[label]);
    if (rows.length === 0) continue;
    addSheet(wb, label, exportRows(rows, "Total PNK"), [44, 18, 18, 18]);
  }
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "kleros_staking_rewards.xlsx"
  );
}

export default function StakingRewards() {
  const { phase, progress, errors, data, retry } = useStakingRewards();
  const [activeTab, setActiveTab] = useState(MONTHLY);

  const tabs = useMemo(() => (data ? [MONTHLY, SUMMARY, ...data.months] : [MONTHLY, SUMMARY]), [data]);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    if (activeTab === MONTHLY) return data.months.map((label) => monthTotalRow(label, data.monthData[label]));
    if (activeTab === SUMMARY) return summaryRows(data);
    return monthWalletRows(data.monthData[activeTab] ?? { mainnet: {}, gnosis: {} });
  }, [data, activeTab]);

  const columns = useMemo(() => {
    if (activeTab === MONTHLY) return pnkColumns("Month", "Total PNK");
    if (activeTab === SUMMARY) return pnkColumns("Address", "Grand Total");
    return pnkColumns("Address", "Total PNK");
  }, [activeTab]);

  const isMonthly = activeTab === MONTHLY;

  return (
    <div>
      <PageHeader
        title="Staking Rewards"
        description="Monthly PNK rewards for jurors staking in Kleros Court, distributed on Ethereum Mainnet and Gnosis. Reconstructed from the merkle-drop snapshots published to IPFS."
        actions={
          phase === "done" &&
          data && (
            <>
              <HeaderMeta>
                {Object.keys(data.grandTotals).length.toLocaleString()} addresses · {data.months.length} months
              </HeaderMeta>
              <PrimaryButton onClick={() => downloadXlsx(data)}>Download XLSX</PrimaryButton>
            </>
          )
        }
      />

      {phase === "fetching" && <FetchProgress title="Fetching snapshots from IPFS..." progress={progress} />}

      {phase === "error" && (
        <ErrorState message={errors[0] ?? "All snapshot fetches failed."} onRetry={retry} />
      )}

      {phase === "done" && data && (
        <>
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
            noun={isMonthly ? ["month", "months"] : ["address", "addresses"]}
            searchPlaceholder={isMonthly ? "Search month…" : "Search by wallet address (0x…)"}
            onRowClick={isMonthly ? (row) => setActiveTab(String(row.Month)) : undefined}
          />
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
