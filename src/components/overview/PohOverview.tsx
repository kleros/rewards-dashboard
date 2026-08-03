import { useMemo } from "react";
import { useTheme } from "styled-components";

import MiniChart from "components/charts/MiniChart";
import StackedColumnChart, { StackPoint } from "components/charts/StackedColumnChart";
import { fmtCompact, fmtWhole } from "components/charts/utils";
import { PohData } from "hooks/usePohRewards";
import { usePnkTotalSupply } from "hooks/usePnkTotalSupply";
import { formatDuration, formatMonthLabel, formatPNK, formatPNKWhole, monthSpan, toPnkNumber } from "utils/format";

import {
  ChartHead,
  ChartTitle,
  Eyebrow,
  FigSub,
  Hero,
  HeroChart,
  HeroFig,
  HeroLatest,
  HeroNote,
  HeroNum,
  SmallMultiples,
  SmallMultiplesGrid,
  Supply,
  SupplyCaption,
  SupplyContext,
  SupplyFill,
  SupplyTrack,
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
  claims: number;
  total: number; // PNK
  cumulative: number; // PNK claimed up to and including this month
}

function usePohOverview(data: PohData) {
  const supplyWei = usePnkTotalSupply();
  return useMemo(() => {
    let cumulative = 0;
    const ascending: MonthRow[] = [...data.months].reverse().map((month) => {
      const total = toPnkNumber(month.total);
      cumulative += total;
      return { label: month.label, claims: month.recipients.length, total, cumulative };
    });

    const totalWei = data.recipients.reduce((sum, reward) => sum + reward.amount, 0n);
    const humans = data.recipients.length;
    const span =
      ascending.length > 0 ? monthSpan(ascending[0].label, ascending[ascending.length - 1].label) : null;

    // Only call the airdrop "fixed" if every fetched claim really is the same
    // amount — otherwise present the average as an average.
    const uniformAmount = humans > 0 && data.recipients.every((r) => r.amount === data.recipients[0].amount);

    return {
      ascending,
      months: data.months.length,
      humans,
      totalWei,
      perClaimWei: humans > 0 ? totalWei / BigInt(humans) : 0n,
      uniformAmount,
      duration: span === null ? null : formatDuration(span),
      supplyPct: Number((totalWei * 10000n) / supplyWei) / 100,
      supplyWei,
    };
  }, [data, supplyWei]);
}

export function PohOverview({ data }: { data: PohData }) {
  const theme = useTheme();
  const m = usePohOverview(data);
  if (m.ascending.length === 0) return null;

  const first = m.ascending[0];
  const latest = m.ascending[m.ascending.length - 1];

  // Single series: the chart title names it, so no legend box.
  const series = [{ name: "Claims", color: theme.seriesA }];
  const points: StackPoint[] = m.ascending.map((row) => ({
    label: row.label,
    values: [row.total],
    tipNote: `${row.claims.toLocaleString()} claims`,
  }));

  return (
    <>
      <Hero>
        <HeroFig>
          <Eyebrow>PNK claimed to date</Eyebrow>
          <HeroNum>
            {formatPNKWhole(m.totalWei)}
            <Unit>PNK</Unit>
          </HeroNum>
          <HeroNote>
            Every registered human in Proof of Humanity v2 can claim{" "}
            <b>
              once — {m.uniformAmount ? "a fixed" : "on average"} {formatPNKWhole(m.perClaimWei)} PNK
            </b>
            , paid on-chain on Gnosis the moment they claim. The chart follows verification, not a payroll:{" "}
            <b>each column is humans choosing to claim</b> that month.
          </HeroNote>
          <HeroLatest>
            Latest month · {formatMonthLabel(latest.label)}
            <br />
            <b>{fmtWhole(latest.total)}</b> PNK to <b>{latest.claims.toLocaleString()}</b> humans
          </HeroLatest>
        </HeroFig>
        <HeroChart>
          <ChartHead>
            <ChartTitle>
              PNK claimed per month, {formatMonthLabel(first.label)} – {formatMonthLabel(latest.label)}
            </ChartTitle>
          </ChartHead>
          <StackedColumnChart points={points} series={series} />
        </HeroChart>
      </Hero>

      <TileGrid>
        <Tile>
          <TileValue>
            {m.humans.toLocaleString()}
            <TileUnit>humans</TileUnit>
          </TileValue>
          <TileDesc>
            Verified humans who claimed since {formatMonthLabel(first.label)}. One claim per registered humanity, ever.
          </TileDesc>
        </Tile>
        <Tile>
          <TileValue>
            {formatPNKWhole(m.perClaimWei)}
            <TileUnit>PNK / claim{m.uniformAmount ? "" : " (avg)"}</TileUnit>
          </TileValue>
          <TileDesc>
            {m.uniformAmount
              ? "The fixed airdrop each verified human receives — the same amount whether they claim first or last."
              : "Average airdrop received per verified human across all claims to date."}
          </TileDesc>
        </Tile>
        <Tile>
          <TileValue>
            {latest.claims.toLocaleString()}
            <TileUnit>claims in {formatMonthLabel(latest.label)}</TileUnit>
          </TileValue>
          <TileDesc>Humans who claimed in the latest month, read live from the PoH v2 subgraph.</TileDesc>
        </Tile>
      </TileGrid>

      <SmallMultiples>
        <h3>
          {m.humans.toLocaleString()} humans in {m.months} month{m.months === 1 ? "" : "s"}. One claim each.
        </h3>
        <p>
          The two charts share the same timeline. Claims arrive as humans verify — <b>the airdrop rewards personhood,
          not activity</b> — and the running total only ever goes up.
        </p>
        <SmallMultiplesGrid>
          <figure>
            <figcaption>Humans claiming each month</figcaption>
            <FigSub>
              {first.claims.toLocaleString()} in {formatMonthLabel(first.label)} · {latest.claims.toLocaleString()} in{" "}
              {formatMonthLabel(latest.label)}
            </FigSub>
            <MiniChart
              points={m.ascending.map((row) => ({ label: row.label, value: row.claims }))}
              kind="column"
              color={theme.seriesA}
              name="Claims"
            />
          </figure>
          <figure>
            <figcaption>Cumulative PNK claimed</figcaption>
            <FigSub>
              {fmtWhole(first.cumulative)} after {formatMonthLabel(first.label)} · {fmtWhole(latest.cumulative)} after{" "}
              {formatMonthLabel(latest.label)}
            </FigSub>
            <MiniChart
              points={m.ascending.map((row) => ({ label: row.label, value: row.cumulative }))}
              kind="line"
              color={theme.seriesA}
              name="Cumulative PNK"
              format={fmtCompact}
            />
          </figure>
        </SmallMultiplesGrid>
      </SmallMultiples>
    </>
  );
}

export function PohToDate({ data }: { data: PohData }) {
  const m = usePohOverview(data);
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
            months of claims
            <br />
            since {formatMonthLabel(first.label)}
          </div>
        </ToDateItem>
        <ToDateItem>
          <div className="n">{m.humans.toLocaleString()}</div>
          <div className="t">
            humans
            <br />
            rewarded
          </div>
        </ToDateItem>
        <ToDateItem>
          <div className="n">{formatPNK(m.perClaimWei)}</div>
          <div className="t">
            PNK per claim
            <br />
            {m.uniformAmount ? "fixed for everyone" : "on average"}
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
