import { useMemo } from "react";
import { useTheme } from "styled-components";

import MiniChart from "components/charts/MiniChart";
import StackedColumnChart, { StackPoint } from "components/charts/StackedColumnChart";
import { fmtWhole } from "components/charts/utils";
import { PNK_TOTAL_SUPPLY } from "consts/index";
import { StakingData } from "hooks/useStakingRewards";
import { formatDuration, formatMonthLabel, formatPNKWhole, monthSpan, toPnkNumber } from "utils/format";

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
  mainnet: number;
  gnosis: number;
  total: number;
  jurors: number;
  perJuror: number | null;
}

const avg = (values: number[]): number | null =>
  values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

const mult = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

function useStakingOverview(data: StakingData) {
  return useMemo(() => {
    const ascending: MonthRow[] = [...data.months].reverse().map((label) => {
      const bucket = data.monthData[label] ?? { mainnet: {}, gnosis: {} };
      let mainnet = 0n;
      let gnosis = 0n;
      for (const amount of Object.values(bucket.mainnet)) mainnet += amount;
      for (const amount of Object.values(bucket.gnosis)) gnosis += amount;
      const jurors = new Set([...Object.keys(bucket.mainnet), ...Object.keys(bucket.gnosis)]).size;
      const total = toPnkNumber(mainnet + gnosis);
      return {
        label,
        mainnet: toPnkNumber(mainnet),
        gnosis: toPnkNumber(gnosis),
        total,
        jurors,
        perJuror: jurors > 0 ? total / jurors : null,
      };
    });

    let totalWei = 0n;
    let mainnetWei = 0n;
    let gnosisWei = 0n;
    for (const totals of Object.values(data.grandTotals)) {
      mainnetWei += totals.mainnet;
      gnosisWei += totals.gnosis;
      totalWei += totals.mainnet + totals.gnosis;
    }
    const chains = [mainnetWei > 0n ? "Mainnet" : null, gnosisWei > 0n ? "Gnosis" : null].filter(
      (name): name is string => name !== null
    );

    const last12 = ascending.slice(-12);
    const first12 = ascending.slice(0, 12);
    // Same window as the hero figure (all-time average per month).
    const typicalJurors = avg(ascending.map((r) => r.jurors));
    const jurorsLast = avg(last12.map((r) => r.jurors));
    const jurorsFirst = avg(first12.map((r) => r.jurors));
    const perLast = avg(last12.map((r) => r.perJuror).filter((v): v is number => v !== null));
    const perFirst = avg(first12.map((r) => r.perJuror).filter((v): v is number => v !== null));

    const gnosisLast12 = last12.reduce((sum, r) => sum + r.gnosis, 0);
    const totalLast12 = last12.reduce((sum, r) => sum + r.total, 0);

    const span =
      ascending.length > 0 ? monthSpan(ascending[0].label, ascending[ascending.length - 1].label) : null;

    return {
      ascending,
      months: data.months.length,
      jurors: Object.keys(data.grandTotals).length,
      totalWei,
      chains,
      typicalJurors,
      jurorsMultiple: ascending.length >= 24 && jurorsFirst && jurorsLast ? jurorsLast / jurorsFirst : null,
      perJurorDivision: ascending.length >= 24 && perFirst && perLast ? perFirst / perLast : null,
      avgPerJurorLast12: perLast,
      gnosisShareLast12: totalLast12 > 0 ? Math.round((gnosisLast12 / totalLast12) * 100) : null,
      duration: span === null ? null : formatDuration(span),
      supplyPct: Number((totalWei * 10000n) / PNK_TOTAL_SUPPLY) / 100,
    };
  }, [data]);
}

export function StakingOverview({ data }: { data: StakingData }) {
  const theme = useTheme();
  const m = useStakingOverview(data);
  if (m.ascending.length === 0) return null;

  const first = m.ascending[0];
  const latest = m.ascending[m.ascending.length - 1];
  const firstYear = first.label.slice(0, 4);

  const series = [
    { name: "Mainnet", color: theme.seriesA },
    { name: "Gnosis", color: theme.seriesB },
  ];
  const points: StackPoint[] = m.ascending.map((row) => ({
    label: row.label,
    values: [row.mainnet, row.gnosis],
    tipNote: `${row.jurors.toLocaleString()} jurors`,
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
            That reaches about <b>{m.typicalJurors === null ? "—" : fmtWhole(m.typicalJurors)} staking jurors</b> in a
            typical month, split in proportion to each juror's stake.
            {m.gnosisShareLast12 !== null && (
              <>
                {" "}
                Over the last 12 months, <b>{m.gnosisShareLast12}% was paid on Gnosis</b> and the rest on Mainnet.
              </>
            )}
          </HeroNote>
          <HeroLatest>
            Latest month · {formatMonthLabel(latest.label)}
            <br />
            <b>{fmtWhole(latest.total)}</b> PNK to <b>{latest.jurors.toLocaleString()}</b> jurors
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
            {m.jurors.toLocaleString()}
            <TileUnit>jurors</TileUnit>
          </TileValue>
          <TileDesc>
            Distinct juror addresses paid since {formatMonthLabel(first.label)}, across both chains. Staking is open to
            anyone holding PNK.
          </TileDesc>
        </Tile>
        <Tile>
          <TileValue>
            {m.avgPerJurorLast12 === null ? "—" : fmtWhole(m.avgPerJurorLast12)}
            <TileUnit>PNK / juror</TileUnit>
          </TileValue>
          <TileDesc>
            Average monthly reward per staking juror over the last 12 months{" "}
            {m.perJurorDivision !== null && (
              <Chip>
                {m.perJurorDivision >= 1 ? "↓" : "↑"} {mult(m.perJurorDivision >= 1 ? m.perJurorDivision : 1 / m.perJurorDivision)}×
                vs {firstYear}
              </Chip>
            )}
          </TileDesc>
        </Tile>
        <Tile>
          <TileValue>
            {m.gnosisShareLast12 === null ? "—" : `${m.gnosisShareLast12}%`}
            <TileUnit>on Gnosis</TileUnit>
          </TileValue>
          <TileDesc>
            Share of the last 12 months of rewards paid on Gnosis, where staking costs a fraction of Mainnet gas.
          </TileDesc>
        </Tile>
      </TileGrid>

      <SmallMultiples>
        <h3>
          {m.jurorsMultiple !== null && m.perJurorDivision !== null
            ? `Jurors ${m.jurorsMultiple >= 1 ? "up" : "down"} ${mult(m.jurorsMultiple >= 1 ? m.jurorsMultiple : 1 / m.jurorsMultiple)}×. ` +
              `Reward per juror ${m.perJurorDivision >= 1 ? "down" : "up"} ${mult(m.perJurorDivision >= 1 ? m.perJurorDivision : 1 / m.perJurorDivision)}×.`
            : "Who the budget reaches, month by month."}
        </h3>
        <p>
          The two charts share the same timeline. Each month's budget is split between every staked juror in
          proportion to their stake — <b>the reward per juror follows both the budget and how many jurors share it</b>.
        </p>
        <SmallMultiplesGrid>
          <figure>
            <figcaption>Jurors rewarded each month</figcaption>
            <FigSub>
              {first.jurors.toLocaleString()} in {formatMonthLabel(first.label)} · {latest.jurors.toLocaleString()} in{" "}
              {formatMonthLabel(latest.label)}
            </FigSub>
            <MiniChart
              points={m.ascending.map((row) => ({ label: row.label, value: row.jurors }))}
              kind="column"
              color={theme.seriesA}
              name="Jurors"
            />
          </figure>
          <figure>
            <figcaption>Average PNK per juror</figcaption>
            <FigSub>
              {first.perJuror === null ? "—" : fmtWhole(first.perJuror)} in {formatMonthLabel(first.label)} ·{" "}
              {latest.perJuror === null ? "—" : fmtWhole(latest.perJuror)} in {formatMonthLabel(latest.label)}
            </FigSub>
            <MiniChart
              points={m.ascending.map((row) => ({ label: row.label, value: row.perJuror }))}
              kind="line"
              color={theme.seriesA}
              name="PNK / juror"
            />
          </figure>
        </SmallMultiplesGrid>
      </SmallMultiples>
    </>
  );
}

export function StakingToDate({ data }: { data: StakingData }) {
  const m = useStakingOverview(data);
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
          <div className="n">{m.jurors.toLocaleString()}</div>
          <div className="t">
            jurors
            <br />
            paid
          </div>
        </ToDateItem>
        <ToDateItem>
          <div className="n">{m.chains.length}</div>
          <div className="t">
            chain{m.chains.length === 1 ? "" : "s"}
            <br />
            {m.chains.join(" & ")}
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
          <SupplyCaption>{m.supplyPct}% of {formatPNKWhole(PNK_TOTAL_SUPPLY)} PNK total supply</SupplyCaption>
        </Supply>
      </ToDateGrid>
    </ToDate>
  );
}
