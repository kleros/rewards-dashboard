import { useMemo } from "react";
import { useTheme } from "styled-components";

import MiniChart from "components/charts/MiniChart";
import StackedColumnChart, { StackPoint } from "components/charts/StackedColumnChart";
import { fmtWhole } from "components/charts/utils";
import { CurateData, countEntries, countTotalEntries } from "hooks/useCurateRewards";
import { usePnkTotalSupply } from "hooks/usePnkTotalSupply";
import { formatDuration, formatMonthLabel, formatPNKWhole, monthSpan, toPnkNumber, toWei } from "utils/format";

import {
  ChartHead,
  ChartTitle,
  Chip,
  Eyebrow,
  FigSub,
  Hero,
  HeroChart,
  HeroFig,
  HeroLatest,
  HeroNote,
  HeroNum,
  Legend,
  LegendKey,
  SmallMultiples,
  SmallMultiplesGrid,
  Supply,
  SupplyCaption,
  SupplyContext,
  SupplyFill,
  SupplyTrack,
  Swatch,
  Tile,
  TileDesc,
  TileGrid,
  TileUnit,
  TileValue,
  ToDate,
  ToDateGrid,
  ToDateItem,
  ToDateLabel,
  Unit,
} from "./OverviewSections";

interface MonthRow {
  label: string;
  entries: number | null; // exact count, or a floor when entriesExact is false
  entriesExact: boolean;
  subEntries: number | null;
  sub: number;
  rem: number;
  atq: number;
  total: number;
  perSub: number | null; // PNK paid per accepted submission
}

export interface CurateOverviewModel {
  ascending: MonthRow[];
  months: number;
  contributors: number;
  totalWei: bigint;
  subWei: bigint;
  entriesTotal: number;
  entriesTotalIsFloor: boolean; // true when some months have no recoverable count
  typicalEntries: number | null; // all-time avg entries per month (known months)
  avgSubLast12: number | null; // avg PNK per submission, last 12 months
  volumeMultiple: number | null; // entries last 12 vs first 12
  priceDivision: number | null; // per-submission price first 12 vs last 12
  maxMonthlySub: number; // highest monthly submission spend ever
  recentSubAvg: number | null; // avg monthly submission spend, last 12 months
  spendMultiple: number | null; // total monthly spend, last 12 vs first 12
  registryCount: number; // distinct registries seen in itemized reward lines
  duration: string | null;
  supplyPct: number;
  supplyWei: bigint; // live PNK totalSupply() the percentage is computed against
}

const avg = (values: number[]): number | null =>
  values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

// One multiple to 1 decimal ("7×" reads better than "7.03×", "2.8×" keeps its decimal).
const mult = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

export function useCurateOverview(data: CurateData): CurateOverviewModel {
  const supplyWei = usePnkTotalSupply();
  return useMemo(() => {
    const ascending: MonthRow[] = [...data.periods].reverse().map(({ label, snapshot }) => {
      const totals = snapshot.totals ?? {};
      const sub = toPnkNumber(toWei(totals.submissions));
      const subEntries = countEntries(snapshot, "submissions");
      const entryTotal = countTotalEntries(snapshot);
      return {
        label,
        entries: entryTotal?.value ?? null,
        entriesExact: entryTotal?.exact ?? false,
        subEntries,
        sub,
        rem: toPnkNumber(toWei(totals.removals)),
        atq: toPnkNumber(toWei(totals.atq)),
        total: toPnkNumber(toWei(totals.total)),
        perSub: subEntries && subEntries > 0 ? sub / subEntries : null,
      };
    });

    let totalWei = 0n;
    let subWei = 0n;
    const registries = new Set<string>();
    for (const { snapshot } of data.periods) {
      totalWei += toWei(snapshot.totals?.total);
      subWei += toWei(snapshot.totals?.submissions);
      for (const recipient of Object.values(snapshot.recipients ?? {})) {
        for (const line of [...(recipient.submissions ?? []), ...(recipient.removals ?? [])]) {
          if (line.registry) registries.add(line.registry);
        }
      }
    }

    const known = (rows: MonthRow[]) => rows.filter((r) => r.entries !== null).map((r) => r.entries as number);
    const knownPer = (rows: MonthRow[]) => rows.filter((r) => r.perSub !== null).map((r) => r.perSub as number);

    const last12 = ascending.slice(-12);
    const first12 = ascending.slice(0, 12);
    // Same window as the hero figure (all-time average per month), so "that
    // buys about N entries" pairs like with like.
    const typicalEntries = avg(known(ascending));
    const entriesLast = avg(known(last12));
    const avgSubLast12 = avg(knownPer(last12));
    const entriesFirst = avg(known(first12));
    const perFirst = avg(knownPer(first12));

    const volumeMultiple =
      ascending.length >= 24 && entriesFirst && entriesLast ? entriesLast / entriesFirst : null;
    const priceDivision =
      ascending.length >= 24 && perFirst && avgSubLast12 ? perFirst / avgSubLast12 : null;

    const maxMonthlySub = Math.max(...ascending.map((r) => r.sub), 0);
    const recentSubAvg = avg(last12.map((r) => r.sub));
    const spendFirst = avg(first12.map((r) => r.total));
    const spendLast = avg(last12.map((r) => r.total));
    const spendMultiple = ascending.length >= 24 && spendFirst && spendLast ? spendLast / spendFirst : null;

    const span =
      ascending.length > 0 ? monthSpan(ascending[0].label, ascending[ascending.length - 1].label) : null;

    return {
      ascending,
      months: data.periods.length,
      contributors: Object.keys(data.grandTotals).length,
      totalWei,
      subWei,
      entriesTotal: known(ascending).reduce((a, b) => a + b, 0),
      // A month with an unknown or floor count makes the total a floor too,
      // and the UI marks it with a trailing "+".
      entriesTotalIsFloor: ascending.some((r) => r.entries === null || !r.entriesExact),
      typicalEntries,
      avgSubLast12,
      volumeMultiple,
      priceDivision,
      maxMonthlySub,
      recentSubAvg,
      spendMultiple,
      registryCount: registries.size,
      duration: span === null ? null : formatDuration(span),
      supplyPct: Number((totalWei * 10000n) / supplyWei) / 100,
      supplyWei,
    };
  }, [data, supplyWei]);
}

const entriesLabel = (row: { entries: number | null; entriesExact: boolean }): string =>
  row.entries === null ? "—" : `${row.entries.toLocaleString()}${row.entriesExact ? "" : "+"}`;

export function CurateOverview({ data }: { data: CurateData }) {
  const theme = useTheme();
  const m = useCurateOverview(data);
  if (m.ascending.length === 0) return null;

  const first = m.ascending[0];
  const latest = m.ascending[m.ascending.length - 1];
  const firstYear = first.label.slice(0, 4);

  const series = [
    { name: "Submissions", color: theme.seriesA },
    { name: "ATQ", color: theme.seriesB },
    { name: "Removals", color: theme.seriesC },
  ];
  const points: StackPoint[] = m.ascending.map((row) => ({
    label: row.label,
    values: [row.sub, row.atq, row.rem],
    tipNote:
      row.entries === null ? undefined : `${row.entries.toLocaleString()}${row.entriesExact ? "" : "+"} entries`,
  }));

  return (
    <>
      <Hero>
        <HeroFig>
          <Eyebrow>Average paid per month</Eyebrow>
          <HeroNum>
            {formatPNKWhole(m.totalWei / BigInt(m.months))}
            <Unit>PNK</Unit>
          </HeroNum>
          <HeroNote>
            That buys about <b>{m.typicalEntries === null ? "—" : fmtWhole(m.typicalEntries)} accepted entries</b> in a
            typical month, shared between the contributors who produced them. Submission rewards have never exceeded{" "}
            <b>{fmtWhole(m.maxMonthlySub)} PNK a month</b>
            {m.recentSubAvg !== null && <> — lately about {fmtWhole(m.recentSubAvg)}</>}
            {m.volumeMultiple !== null ? (
              <>
                , while monthly volume {m.volumeMultiple >= 1 ? "grew" : "shrank"}{" "}
                {mult(m.volumeMultiple >= 1 ? m.volumeMultiple : 1 / m.volumeMultiple)}× since {firstYear}
              </>
            ) : null}
            .
          </HeroNote>
          <HeroLatest>
            Latest month · {formatMonthLabel(latest.label)}
            <br />
            <b>{fmtWhole(latest.total)}</b> PNK
            {latest.entries !== null && (
              <>
                {" "}
                to <b>{entriesLabel(latest)}</b> entries
              </>
            )}
          </HeroLatest>
        </HeroFig>
        <HeroChart>
          <ChartHead>
            <ChartTitle>
              Monthly payout, {formatMonthLabel(first.label)} – {formatMonthLabel(latest.label)}
            </ChartTitle>
            <Legend>
              {series.map((s) => (
                <LegendKey key={s.name}>
                  <Swatch $color={s.color} />
                  {s.name}
                </LegendKey>
              ))}
            </Legend>
          </ChartHead>
          <StackedColumnChart points={points} series={series} />
        </HeroChart>
      </Hero>

      <TileGrid>
        <Tile>
          <TileValue>
            {m.entriesTotal.toLocaleString()}
            {m.entriesTotalIsFloor ? "+" : ""}
            <TileUnit>entries</TileUnit>
          </TileValue>
          <TileDesc>
            Registry entries curated since {formatMonthLabel(first.label)}. Every one is publicly listed, challengeable,
            and on-chain.
          </TileDesc>
        </Tile>
        <Tile>
          <TileValue>
            {m.avgSubLast12 === null ? "—" : fmtWhole(m.avgSubLast12)}
            <TileUnit>PNK / submission</TileUnit>
          </TileValue>
          <TileDesc>
            Average paid per accepted submission over the last 12 months{" "}
            {m.priceDivision !== null && (
              <Chip>
                {m.priceDivision >= 1 ? "↓" : "↑"} {mult(m.priceDivision >= 1 ? m.priceDivision : 1 / m.priceDivision)}×
                vs {firstYear}
              </Chip>
            )}
          </TileDesc>
        </Tile>
        <Tile>
          <TileValue>
            {m.contributors.toLocaleString()}
            <TileUnit>contributors</TileUnit>
          </TileValue>
          <TileDesc>Independent curators paid to date. No single recipient is guaranteed a monthly allocation.</TileDesc>
        </Tile>
      </TileGrid>

      <SmallMultiples>
        <h3>
          {m.volumeMultiple !== null && m.priceDivision !== null
            ? `Volume ${m.volumeMultiple >= 1 ? "up" : "down"} ${mult(m.volumeMultiple >= 1 ? m.volumeMultiple : 1 / m.volumeMultiple)}×. ` +
              `Price per submission ${m.priceDivision >= 1 ? "down" : "up"} ${mult(m.priceDivision >= 1 ? m.priceDivision : 1 / m.priceDivision)}×.`
            : "What the registries absorbed, month by month."}
        </h3>
        <p>
          The two charts share the same timeline.
          {m.volumeMultiple !== null && m.volumeMultiple > 1 && m.priceDivision !== null && m.priceDivision > 1 ? (
            <>
              {" "}
              The registries are absorbing far more work than they did in {firstYear}, and each accepted submission
              costs a fraction of what it used to.
            </>
          ) : (
            <> They track how much work the registries absorbed and what each accepted submission cost.</>
          )}
          {m.spendMultiple !== null && m.volumeMultiple !== null && (
            <>
              {" "}
              <b>
                The monthly spend {m.spendMultiple >= 1 ? "grew" : "shrank"}{" "}
                {mult(m.spendMultiple >= 1 ? m.spendMultiple : 1 / m.spendMultiple)}× while the work{" "}
                {m.volumeMultiple >= 1 ? "grew" : "shrank"}{" "}
                {mult(m.volumeMultiple >= 1 ? m.volumeMultiple : 1 / m.volumeMultiple)}×.
              </b>
            </>
          )}
        </p>
        <SmallMultiplesGrid>
          <figure>
            <figcaption>Entries accepted each month</figcaption>
            <FigSub>
              {entriesLabel(first)} in {formatMonthLabel(first.label)} · {entriesLabel(latest)} in{" "}
              {formatMonthLabel(latest.label)}
            </FigSub>
            <MiniChart
              points={m.ascending.map((row) => ({
                label: row.label,
                value: row.entries,
                display: row.entries === null ? undefined : entriesLabel(row),
              }))}
              kind="column"
              color={theme.seriesA}
              name="Entries"
            />
          </figure>
          <figure>
            <figcaption>PNK paid per accepted submission</figcaption>
            <FigSub>
              {first.perSub === null ? "—" : fmtWhole(first.perSub)} in {formatMonthLabel(first.label)} ·{" "}
              {latest.perSub === null ? "—" : fmtWhole(latest.perSub)} in {formatMonthLabel(latest.label)}
            </FigSub>
            <MiniChart
              points={m.ascending.map((row) => ({ label: row.label, value: row.perSub }))}
              kind="line"
              color={theme.seriesA}
              name="PNK / submission"
            />
          </figure>
        </SmallMultiplesGrid>
      </SmallMultiples>
    </>
  );
}

export function CurateToDate({ data }: { data: CurateData }) {
  const m = useCurateOverview(data);
  if (m.ascending.length === 0) return null;
  const first = m.ascending[0];

  return (
    <ToDate>
      <ToDateLabel>Program to date</ToDateLabel>
      <ToDateGrid>
        <ToDateItem>
          <div className="n">{formatPNKWhole(m.totalWei)}</div>
          <div className="t">
            PNK distributed
            <br />
            in total
          </div>
        </ToDateItem>
        <ToDateItem>
          <div className="n">{m.months}</div>
          <div className="t">
            monthly distributions
            <br />
            since {formatMonthLabel(first.label)}
          </div>
        </ToDateItem>
        <ToDateItem>
          <div className="n">
            {m.entriesTotal.toLocaleString()}
            {m.entriesTotalIsFloor ? "+" : ""}
          </div>
          <div className="t">
            entries curated
            <br />
            {m.registryCount > 1 ? `across ${m.registryCount} registries` : "and on-chain"}
          </div>
        </ToDateItem>
        <ToDateItem>
          <div className="n">{m.contributors.toLocaleString()}</div>
          <div className="t">
            contributors
            <br />
            paid
          </div>
        </ToDateItem>
        <Supply>
          <SupplyContext>
            The all-time total is <b>about {m.supplyPct}% of PNK total supply</b>
            {m.duration !== null && <>, spread over {m.duration}</>}.
          </SupplyContext>
          <SupplyTrack>
            <SupplyFill $pct={m.supplyPct} />
          </SupplyTrack>
          <SupplyCaption>{m.supplyPct}% of {formatPNKWhole(m.supplyWei)} PNK total supply</SupplyCaption>
        </Supply>
      </ToDateGrid>
    </ToDate>
  );
}
