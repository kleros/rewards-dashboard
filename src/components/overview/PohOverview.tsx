import { useMemo } from "react";
import { useTheme } from "styled-components";

import MiniChart from "components/charts/MiniChart";
import StackedColumnChart, { StackPoint } from "components/charts/StackedColumnChart";
import { fmtCompact, fmtWhole } from "components/charts/utils";
import { PohData } from "hooks/usePohRewards";
import { usePnkTotalSupply } from "hooks/usePnkTotalSupply";
import { formatDuration, formatMonthLabel, formatPNK, formatPNKWhole, monthSpan, toPnkNumber } from "utils/format";
import { countHumans, sumAmounts } from "utils/pohRewards";

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
  claims: number;
  bonuses: number;
  humans: number;
  airdrop: number; // PNK
  stakeBonus: number; // PNK
  total: number; // PNK
  cumulative: number; // PNK paid up to and including this month
}

function usePohOverview(data: PohData) {
  const supplyWei = usePnkTotalSupply();
  return useMemo(() => {
    let cumulativeWei = 0n;
    const ascending: MonthRow[] = [...data.months].reverse().map((month) => {
      cumulativeWei += month.total;
      return {
        label: month.label,
        claims: month.claims,
        bonuses: month.bonuses,
        humans: month.humans,
        airdrop: toPnkNumber(month.airdrop),
        stakeBonus: toPnkNumber(month.stakeBonus),
        total: toPnkNumber(month.total),
        cumulative: toPnkNumber(cumulativeWei),
      };
    });

    const claims = data.rewards.filter((reward) => reward.kind === "airdrop");
    const bonuses = data.rewards.filter((reward) => reward.kind === "stakeBonus");
    const airdropWei = sumAmounts(claims);
    const bonusWei = sumAmounts(bonuses);
    const totalWei = airdropWei + bonusWei;
    const span =
      ascending.length > 0 ? monthSpan(ascending[0].label, ascending[ascending.length - 1].label) : null;

    // Only call an amount "fixed" if every fetched payment really is the same
    // amount — otherwise present the average as an average.
    const uniform = (rewards: typeof claims) => rewards.length > 0 && rewards.every((r) => r.amount === rewards[0].amount);

    return {
      ascending,
      months: data.months.length,
      humans: countHumans(data.rewards),
      claims: claims.length,
      bonuses: bonuses.length,
      bonusHumans: countHumans(bonuses),
      firstBonusMonth: ascending.find((row) => row.bonuses > 0)?.label ?? null,
      totalWei,
      bonusWei,
      perClaimWei: claims.length > 0 ? airdropWei / BigInt(claims.length) : 0n,
      uniformAmount: uniform(claims),
      perBonusWei: bonuses.length > 0 ? bonusWei / BigInt(bonuses.length) : 0n,
      uniformBonus: uniform(bonuses),
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
  const hasBonus = m.bonuses > 0;

  // With no stake bonus loaded the airdrop is the only series: the chart title
  // names it, so no legend box.
  const series = hasBonus
    ? [
        { name: "Airdrop claims", color: theme.seriesA },
        { name: "Stake bonus", color: theme.seriesB },
      ]
    : [{ name: "Claims", color: theme.seriesA }];
  const points: StackPoint[] = m.ascending.map((row) => ({
    label: row.label,
    values: hasBonus ? [row.airdrop, row.stakeBonus] : [row.airdrop],
    tipNote:
      `${row.claims.toLocaleString()} claims` +
      (row.bonuses > 0 ? ` · ${row.bonuses.toLocaleString()} stake bonus${row.bonuses === 1 ? "" : "es"}` : ""),
  }));

  return (
    <>
      <Hero>
        <HeroFig>
          <Eyebrow>PNK distributed to date</Eyebrow>
          <HeroNum>
            {formatPNKWhole(m.totalWei)}
            <Unit>PNK</Unit>
          </HeroNum>
          <HeroNote>
            Every registered human in Proof of Humanity v2 can claim{" "}
            <b>
              once — {m.uniformAmount ? "a fixed" : "on average"} {formatPNKWhole(m.perClaimWei)} PNK
            </b>
            , paid on-chain on Gnosis the moment they claim.
            {hasBonus && (
              <>
                {" "}
                Keeping at least 1,200 PNK staked in the Humanity court for six months earns{" "}
                <b>
                  the stake bonus, {m.uniformBonus ? "" : "on average "}
                  {formatPNKWhole(m.perBonusWei)} PNK more
                </b>
                : {formatPNKWhole(m.bonusWei)} PNK to {m.bonusHumans.toLocaleString()} humans so far.
              </>
            )}{" "}
            The chart follows verification, not a payroll: <b>each column is humans choosing to claim</b> that month
            {hasBonus ? ", plus the stake bonuses paid in it" : ""}.
          </HeroNote>
          <HeroLatest>
            Latest month · {formatMonthLabel(latest.label)}
            <br />
            <b>{fmtWhole(latest.total)}</b> PNK to <b>{latest.humans.toLocaleString()}</b> humans
          </HeroLatest>
        </HeroFig>
        <HeroChart>
          <ChartHead>
            <ChartTitle>
              PNK paid per month, {formatMonthLabel(first.label)} – {formatMonthLabel(latest.label)}
            </ChartTitle>
            {hasBonus && (
              <Legend>
                {series.map((s) => (
                  <LegendKey key={s.name}>
                    <Swatch $color={s.color} />
                    {s.name}
                  </LegendKey>
                ))}
              </Legend>
            )}
          </ChartHead>
          <StackedColumnChart points={points} series={series} />
        </HeroChart>
      </Hero>

      <TileGrid>
        <Tile>
          <TileValue>
            {m.claims.toLocaleString()}
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
        {hasBonus && m.firstBonusMonth !== null ? (
          <Tile>
            <TileValue>
              {m.bonuses.toLocaleString()}
              <TileUnit>stake bonuses</TileUnit>
            </TileValue>
            <TileDesc>
              {formatPNKWhole(m.perBonusWei)} PNK more{m.uniformBonus ? " each" : " on average"}, paid since{" "}
              {formatMonthLabel(m.firstBonusMonth)} to humans who kept at least 1,200 PNK staked in the Humanity court
              for six months after claiming.
            </TileDesc>
          </Tile>
        ) : (
          <Tile>
            <TileValue>
              {latest.claims.toLocaleString()}
              <TileUnit>claims in {formatMonthLabel(latest.label)}</TileUnit>
            </TileValue>
            <TileDesc>Humans who claimed in the latest month, read live from the PoH v2 subgraph.</TileDesc>
          </Tile>
        )}
      </TileGrid>

      <SmallMultiples>
        <h3>
          {m.claims.toLocaleString()} humans in {m.months} month{m.months === 1 ? "" : "s"}. One claim each.
        </h3>
        <p>
          The two charts share the same timeline. Claims arrive as humans verify — <b>the airdrop rewards personhood,
          not activity</b> — and the running total only ever goes up.
          {hasBonus && <> The stake bonus follows each claim by at least six months.</>}
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
            <figcaption>Cumulative PNK distributed</figcaption>
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
            months of payments
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
        {m.firstBonusMonth !== null && (
          <ToDateItem>
            <div className="n">{m.bonuses.toLocaleString()}</div>
            <div className="t">
              stake bonuses paid
              <br />
              since {formatMonthLabel(m.firstBonusMonth)}
            </div>
          </ToDateItem>
        )}
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
