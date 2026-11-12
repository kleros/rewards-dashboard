import { useMemo, useState } from "react";
import styled, { useTheme } from "styled-components";

import { PrimaryButton, SecondaryButton } from "components/Buttons";
import ErrorState from "components/ErrorState";
import FetchProgress from "components/FetchProgress";
import { PohOverview, PohToDate } from "components/overview/PohOverview";
import PageHeader from "components/PageHeader";
import RewardsTable, { Column, Mono, Row } from "components/RewardsTable";
import { BAR_MAX_WIDTH, Bar, BarNum, BarWrap } from "components/TableCells";
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
import Tabs from "components/Tabs";
import { PohData, PohKind, PohMonth, PohReward, usePohRewards } from "hooks/usePohRewards";
import {
  downloadBlob,
  formatDuration,
  formatMonthLabel,
  formatMonthsStat,
  formatPNK,
  monthSpan,
  shortAddress,
  toCsv,
  toPnkNumber,
} from "utils/format";
import { countHumans, walletTotals } from "utils/pohRewards";

// The two fixed tabs. The remaining tabs are month labels ("2026-07"), which are
// dynamic strings — so `activeTab` is a string that is either a Tab value or a label.
enum Tab {
  Monthly = "Monthly Totals",
  Summary = "Summary",
}

// Both the airdrop and the stake bonus are only paid on Gnosis, so the drill-down chain column is constant.
const CHAIN_LABEL = "Gnosis Chain";

const KIND_LABEL: Record<PohKind, string> = { airdrop: "Airdrop", stakeBonus: "Stake bonus" };

const Pill = styled.span<{ $kind: PohKind }>`
  display: inline-block;
  padding: 1px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme, $kind }) => ($kind === "airdrop" ? theme.primaryBlue : theme.seriesB)};
  background: ${({ theme, $kind }) => `${$kind === "airdrop" ? theme.primaryBlue : theme.seriesB}22`};
`;

const Notice = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 18px;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.error};
  border-radius: 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.secondaryText};

  b {
    color: ${({ theme }) => theme.error};
  }
`;

// Render an ISO timestamp as a plain YYYY-MM-DD (empty for missing/invalid input).
function formatIsoDate(isoTimestamp: string | undefined): string {
  if (!isoTimestamp) return "";
  const date = new Date(isoTimestamp);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function monthlyRows(data: PohData): Row[] {
  return data.months.map((month) => ({
    month: month.label,
    humans: BigInt(month.humans),
    airdrop: month.airdrop,
    stakeBonus: month.stakeBonus,
    total: month.total,
  }));
}

// One table row per wallet — used for both the all-time Summary and each
// month's recipient table (they render the same recipient / humanity / amounts).
function walletRows(rewards: PohReward[]): Row[] {
  return walletTotals(rewards).map((wallet) => ({
    addr: wallet.address,
    humanity: wallet.humanityId,
    airdrop: wallet.airdrop,
    stakeBonus: wallet.stakeBonus,
    total: wallet.total,
  }));
}

function scopeStats(tab: string, data: PohData): Stat[] {
  const isAllTime = tab === Tab.Summary || tab === Tab.Monthly;
  const month = isAllTime ? undefined : data.months.find((candidate) => candidate.label === tab);
  const rewards = isAllTime ? data.rewards : month?.rewards ?? [];
  let airdrop = 0n;
  let stakeBonus = 0n;
  let claims = 0;
  let bonuses = 0;
  for (const reward of rewards) {
    if (reward.kind === "airdrop") {
      airdrop += reward.amount;
      claims++;
    } else {
      stakeBonus += reward.amount;
      bonuses++;
    }
  }
  const span =
    data.months.length > 0 ? monthSpan(data.months[data.months.length - 1].label, data.months[0].label) : null;
  return [
    isAllTime
      ? { label: "Months", value: formatMonthsStat(data.months.length, span) }
      : { label: "Month", value: tab },
    { label: "Humans rewarded", value: countHumans(rewards).toLocaleString() },
    { label: "Total distributed", value: `${formatPNK(airdrop + stakeBonus)} PNK` },
    { label: `Airdrop · ${claims.toLocaleString()} claim${claims === 1 ? "" : "s"}`, value: `${formatPNK(airdrop)} PNK` },
    {
      label: `Stake bonus · ${bonuses.toLocaleString()} payment${bonuses === 1 ? "" : "s"}`,
      value: `${formatPNK(stakeBonus)} PNK`,
    },
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

// Most wallets and months have no stake bonus: show a dash rather than a column of zeros.
const dimZero = (key: string) => (row: Row) => ((row[key] as bigint) === 0n ? "—" : formatPNK(row[key] as bigint));

function walletColumns(): Column[] {
  return [
    monoColumn("addr", "Recipient"),
    monoColumn("humanity", "Humanity ID"),
    { key: "airdrop", label: "Airdrop", align: "right", render: dimZero("airdrop") },
    { key: "stakeBonus", label: "Stake bonus", align: "right", render: dimZero("stakeBonus") },
    { key: "total", label: "Total (PNK)", align: "right" },
  ];
}

function monthlyColumns(maxTotal: bigint, barColor: string): Column[] {
  return [
    { key: "month", label: "Month", align: "left" },
    {
      key: "humans",
      label: "Humans rewarded",
      align: "right",
      render: (row) => Number(row.humans).toLocaleString(),
    },
    { key: "airdrop", label: "Airdrop", align: "right", render: dimZero("airdrop") },
    { key: "stakeBonus", label: "Stake bonus", align: "right", render: dimZero("stakeBonus") },
    {
      key: "total",
      label: "Total",
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
  months: PohMonth[];
  onBack: () => void;
}

interface MonthBlock {
  label: string;
  total: bigint;
  rewards: PohReward[];
}

function WalletDetail({ address, months, onBack }: WalletDetailProps) {
  // A wallet claims the airdrop once and may get the stake bonus months later:
  // one block per month it was paid in, one line per payment.
  let allTimeTotal = 0n;
  const blocks: MonthBlock[] = [];
  for (const month of months) {
    const rewards = month.rewards
      .filter((candidate) => candidate.address === address)
      .sort((a, b) => a.paidAt.localeCompare(b.paidAt));
    if (rewards.length === 0) continue;
    const total = rewards.reduce((sum, reward) => sum + reward.amount, 0n);
    allTimeTotal += total;
    blocks.push({ label: month.label, total, rewards });
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
          blocks.map(({ label, total, rewards }) => (
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
                    {rewards.map((reward, i) => (
                      <tr key={i}>
                        <td>
                          <Pill
                            $kind={reward.kind}
                            title={
                              reward.windowEnd
                                ? `For keeping the airdrop staked six months, until ${reward.windowEnd}`
                                : undefined
                            }
                          >
                            {KIND_LABEL[reward.kind]}
                          </Pill>
                        </td>
                        <td>
                          {/* A bonus sits in the month it was earned, so say when it was paid. */}
                          <MutedLabel as="span">
                            {reward.txHash ? (
                              <>
                                paid{" "}
                                <a
                                  href={`https://gnosisscan.io/tx/${reward.txHash}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={`${reward.txHash} — view the payment on the explorer`}
                                >
                                  {formatIsoDate(reward.paidAt)}
                                </a>
                              </>
                            ) : (
                              `claimed ${formatIsoDate(reward.paidAt)}`
                            )}
                          </MutedLabel>
                        </td>
                        <td>
                          <MutedLabel as="span">{CHAIN_LABEL}</MutedLabel>
                        </td>
                        <td>
                          <Mono title={reward.humanityId}>{shortAddress(reward.humanityId)}</Mono>
                        </td>
                        <NumCell>{formatPNK(reward.amount)} PNK</NumCell>
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

export default function PohRewards() {
  const theme = useTheme();
  const { phase, progress, errors, data, retry } = usePohRewards();
  const [chosenTab, setActiveTab] = useState<string>(Tab.Monthly);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  // Search survives tab switches (and the wallet drill-down), held here
  // because the table remounts per tab. Two states because the semantic
  // differs: recipient tabs search addresses, Monthly Totals searches months.
  const [recipientSearch, setRecipientSearch] = useState("");
  const [monthSearch, setMonthSearch] = useState("");

  const tabs = useMemo(
    () => (data ? [Tab.Monthly, Tab.Summary, ...data.months.map((month) => month.label)] : [Tab.Monthly, Tab.Summary]),
    [data]
  );
  // A month can disappear on Retry (one that only had stake bonuses, if its
  // snapshot fails this time): fall back to Monthly Totals rather than an
  // empty month no tab points at.
  const activeTab = tabs.includes(chosenTab) ? chosenTab : Tab.Monthly;

  const isMonthly = activeTab === Tab.Monthly;

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    if (isMonthly) return monthlyRows(data);
    if (activeTab === Tab.Summary) return walletRows(data.rewards);
    return walletRows(data.months.find((month) => month.label === activeTab)?.rewards ?? []);
  }, [data, activeTab, isMonthly]);

  const monthly = useMemo(() => {
    if (!data || !isMonthly) return null;
    let maxTotal = 0n;
    let airdrop = 0n;
    let stakeBonus = 0n;
    for (const month of data.months) {
      airdrop += month.airdrop;
      stakeBonus += month.stakeBonus;
      if (month.total > maxTotal) maxTotal = month.total;
    }
    // Humans are counted once across all months: someone paid the airdrop in
    // one month and the stake bonus in another is one human.
    const footer = [
      `All ${data.months.length} months`,
      <span key="humans" title="Each human once, though the airdrop and the stake bonus are paid in different months">
        {countHumans(data.rewards).toLocaleString()}
      </span>,
      formatPNK(airdrop),
      stakeBonus === 0n ? "—" : formatPNK(stakeBonus),
      formatPNK(airdrop + stakeBonus),
    ];
    return { maxTotal, footer };
  }, [data, isMonthly]);

  const badge = useMemo(() => {
    if (!data || data.months.length === 0) return undefined;
    const span = monthSpan(data.months[data.months.length - 1].label, data.months[0].label);
    return `${span === null ? "" : `Running ${formatDuration(span)} · `}one claim per human`;
  }, [data]);

  function selectTab(tab: string) {
    setSelectedAddress(null);
    setActiveTab(tab);
  }

  function downloadCsv() {
    const header = isMonthly
      ? ["Month", "Humans rewarded", "Airdrop (PNK)", "Stake bonus (PNK)", "Total (PNK)"]
      : ["Recipient", "Humanity ID", "Airdrop (PNK)", "Stake bonus (PNK)", "Total (PNK)"];
    const amounts = (row: Row) => [
      formatPNK(row.airdrop as bigint),
      formatPNK(row.stakeBonus as bigint),
      formatPNK(row.total as bigint),
    ];
    const body = rows.map((row) =>
      isMonthly
        ? [String(row.month), String(row.humans), ...amounts(row)]
        : [String(row.addr), String(row.humanity), ...amounts(row)]
    );
    downloadBlob(
      new Blob([toCsv([header, ...body])], { type: "text/csv" }),
      `poh-rewards-${activeTab.replace(/\s+/g, "-").toLowerCase()}${errors.length > 0 ? "-partial" : ""}.csv`
    );
  }

  return (
    <div>
      <PageHeader
        title="Proof of Humanity Rewards"
        badge={phase === "done" ? badge : undefined}
        description={
          <>
            Proof of Humanity v2 registers <strong>verified humans</strong> on-chain. Each registered human can claim
            a <strong>PNK airdrop once</strong>, paid on Gnosis
            {data && data.months.length > 0 && (
              <> since {formatMonthLabel(data.months[data.months.length - 1].label)}</>
            )}{" "}
            — read live from the PoH v2 subgraph. Humans who keep at least 1,200 PNK staked in the Humanity court for
            six months after claiming get a <strong>stake bonus</strong> of 1,200 PNK more, paid in batches and
            published as monthly snapshots on IPFS. A bonus counts in the month its six months ended.
          </>
        }
        actions={phase === "done" && <PrimaryButton onClick={downloadCsv}>Download CSV</PrimaryButton>}
      />

      {phase === "fetching" && <FetchProgress title="Fetching reward data..." progress={progress} />}

      {phase === "error" && <ErrorState message={errors[0] ?? "Could not load the reward data."} onRetry={retry} />}

      {phase === "done" && data && (
        <>
          {errors.length > 0 && (
            <Notice role="alert">
              <span>
                <b>Some stake bonus payments are missing.</b> The totals below leave out what couldn't be loaded (
                {errors.join("; ")}).
              </span>
              <SecondaryButton onClick={retry}>Retry</SecondaryButton>
            </Notice>
          )}
          {isMonthly ? <PohOverview data={data} /> : <StatsRow stats={scopeStats(activeTab, data)} />}
          <Tabs tabs={tabs} active={activeTab} onSelect={selectTab} />
          {selectedAddress ? (
            <WalletDetail address={selectedAddress} months={data.months} onBack={() => setSelectedAddress(null)} />
          ) : (
            <RewardsTable
              // Remount on tab change so the table's internal sort and page
              // state reset to defaults for each tab. Search is controlled
              // from this page so it survives the remount.
              key={activeTab}
              columns={isMonthly && monthly ? monthlyColumns(monthly.maxTotal, theme.seriesA) : walletColumns()}
              rows={rows}
              defaultSortKey={isMonthly ? "month" : undefined}
              noun={isMonthly ? ["month", "months"] : ["recipient", "recipients"]}
              searchPlaceholder={isMonthly ? "Search month…" : "Search by wallet address (0x…)"}
              search={isMonthly ? monthSearch : recipientSearch}
              onSearchChange={isMonthly ? setMonthSearch : setRecipientSearch}
              footer={isMonthly && monthly ? monthly.footer : undefined}
              onRowClick={
                isMonthly
                  ? (row) => selectTab(String(row.month))
                  : (row) => setSelectedAddress(String(row.addr).toLowerCase())
              }
            />
          )}
          {isMonthly && !selectedAddress && <PohToDate data={data} />}
          <Foot>
            Data from {data.months.length} month(s): airdrop claims live from the PoH v2 subgraph, stake bonus
            payments from {data.bonusSnapshots} monthly snapshot(s) on IPFS.{" "}
            {isMonthly
              ? "Click a month to open its recipient table."
              : "Click a recipient to see their payments."}
          </Foot>
        </>
      )}
    </div>
  );
}
