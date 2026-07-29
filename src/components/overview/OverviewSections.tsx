import styled from "styled-components";

// Styled primitives for the narrative overview tier shared by the reward
// pages, mirroring the redesign mock: hero (figure + chart), buy-tiles,
// small multiples and the program-to-date band.

// ---- Tier 1: hero ---------------------------------------------------------

export const Hero = styled.section`
  margin-bottom: 14px;
  border: 1px solid ${({ theme }) => theme.stroke};
  border-radius: 12px;
  background: ${({ theme }) => theme.whiteBackground};
  display: grid;
  grid-template-columns: 352px 1fr;
  overflow: hidden;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

export const HeroFig = styled.div`
  padding: 26px 28px;
  border-right: 1px solid ${({ theme }) => theme.stroke};
  display: flex;
  flex-direction: column;
  justify-content: center;

  @media (max-width: 900px) {
    border-right: none;
    border-bottom: 1px solid ${({ theme }) => theme.stroke};
  }
`;

export const Eyebrow = styled.div`
  font-size: 11px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.mutedText};
  font-weight: 600;
  margin-bottom: 10px;
`;

// The single hero figure of the view; proportional figures, not tabular.
export const HeroNum = styled.div`
  font-size: 46px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.primaryText};
`;

export const Unit = styled.span`
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.secondaryText};
  margin-left: 6px;
  letter-spacing: 0;
`;

export const HeroNote = styled.div`
  margin-top: 14px;
  font-size: 12.5px;
  line-height: 1.7;
  color: ${({ theme }) => theme.secondaryText};

  b {
    color: ${({ theme }) => theme.primaryText};
    font-weight: 600;
  }
`;

export const HeroLatest = styled.div`
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid ${({ theme }) => theme.stroke};
  font-size: 12.5px;
  color: ${({ theme }) => theme.secondaryText};

  b {
    color: ${({ theme }) => theme.primaryText};
    font-weight: 600;
    font-size: 15px;
  }
`;

export const HeroChart = styled.div`
  padding: 20px 24px 14px;
  min-width: 0;
`;

export const ChartHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
  gap: 16px;
  flex-wrap: wrap;
`;

export const ChartTitle = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.secondaryText};
  font-weight: 600;
`;

export const Legend = styled.div`
  display: flex;
  gap: 14px;
  font-size: 11px;
  color: ${({ theme }) => theme.secondaryText};
`;

export const LegendKey = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
`;

// Legends mirror the mark: a small rect for column series.
export const Swatch = styled.i<{ $color: string }>`
  width: 9px;
  height: 9px;
  border-radius: 2px;
  display: inline-block;
  background: ${({ $color }) => $color};
`;

// ---- Tier 2: what the money buys ------------------------------------------

export const TileGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 14px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

export const Tile = styled.div`
  border: 1px solid ${({ theme }) => theme.stroke};
  border-radius: 12px;
  background: ${({ theme }) => theme.whiteBackground};
  padding: 18px 20px;
`;

export const TileValue = styled.div`
  font-size: 27px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.01em;
  color: ${({ theme }) => theme.primaryText};
`;

export const TileUnit = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.secondaryText};
  margin-left: 4px;
`;

export const TileDesc = styled.div`
  margin-top: 8px;
  font-size: 12px;
  color: ${({ theme }) => theme.secondaryText};
  line-height: 1.55;
`;

export const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  background: ${({ theme }) => `${theme.seriesC}29`};
  color: ${({ theme }) => (theme.name === "dark" ? "#5FD3B2" : theme.seriesC)};
  margin-left: 2px;
`;

// ---- Small multiples ------------------------------------------------------

export const SmallMultiples = styled.section`
  margin-bottom: 14px;
  border: 1px solid ${({ theme }) => theme.stroke};
  border-radius: 12px;
  background: ${({ theme }) => theme.whiteBackground};
  padding: 22px 24px 16px;

  h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  p {
    margin: 8px 0 0;
    font-size: 12.5px;
    line-height: 1.7;
    color: ${({ theme }) => theme.secondaryText};
    max-width: 760px;

    b {
      color: ${({ theme }) => theme.primaryText};
      font-weight: 600;
    }
  }
`;

export const SmallMultiplesGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  margin-top: 20px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }

  figure {
    margin: 0;
    min-width: 0;
  }

  figcaption {
    font-size: 11.5px;
    color: ${({ theme }) => theme.secondaryText};
    font-weight: 600;
    margin-bottom: 2px;
  }
`;

export const FigSub = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.mutedText};
  margin-bottom: 10px;
`;

// ---- Table head (title + heat-scale key) ----------------------------------

export const TableHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 30px 0 12px;
  gap: 16px;
  flex-wrap: wrap;

  h2 {
    font-size: 17px;
    font-weight: 700;
    margin: 0;

    span {
      font-weight: 400;
      color: ${({ theme }) => theme.mutedText};
      font-size: 13px;
      margin-left: 8px;
    }
  }
`;

export const HeatScale = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  color: ${({ theme }) => theme.mutedText};
`;

export const HeatRamp = styled.span`
  display: flex;

  i {
    width: 16px;
    height: 9px;
    display: block;
  }
`;

// ---- Tier 3: program to date ----------------------------------------------

export const ToDate = styled.section`
  margin-top: 16px;
  border: 1px solid ${({ theme }) => theme.stroke};
  border-radius: 12px;
  background: ${({ theme }) => theme.lightPurple};
  padding: 20px 24px;
`;

export const ToDateLabel = styled.div`
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.mutedText};
  font-weight: 600;
`;

export const ToDateGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 34px;
  align-items: flex-start;
  margin-top: 14px;
`;

export const ToDateItem = styled.div`
  .n {
    font-size: 20px;
    font-weight: 600;
    color: ${({ theme }) => theme.secondaryText};
    line-height: 1.2;
  }

  .t {
    font-size: 11px;
    color: ${({ theme }) => theme.mutedText};
    margin-top: 5px;
    line-height: 1.5;
  }
`;

export const Supply = styled.div`
  min-width: 250px;
  flex: 1;
`;

export const SupplyContext = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.mutedText};
  line-height: 1.6;

  b {
    color: ${({ theme }) => theme.secondaryText};
    font-weight: 600;
  }
`;

export const SupplyTrack = styled.div`
  height: 10px;
  border-radius: 5px;
  background: ${({ theme }) => theme.chartGrid};
  overflow: hidden;
  margin-top: 10px;
`;

export const SupplyFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => Math.min(100, $pct)}%;
  min-width: 10px;
  background: ${({ theme }) => theme.seriesA};
  border-radius: 5px;
`;

export const SupplyCaption = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.mutedText};
  margin-top: 7px;
`;
