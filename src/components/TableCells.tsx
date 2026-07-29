import styled from "styled-components";

import { hexToRgba } from "components/charts/utils";

// In-table data marks for the month-by-month tables: a single-hue heat wash
// behind per-entry averages, and a proportional bar beside the month total.

export const HeatVal = styled.span<{ $bg: string }>`
  display: inline-block;
  padding: 3px 8px;
  border-radius: 5px;
  background: ${({ $bg }) => $bg};
  font-weight: 600;
`;

export const BarWrap = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 11px;
`;

export const Bar = styled.span<{ $width: number; $color: string }>`
  height: 7px;
  border-radius: 0 4px 4px 0;
  background: ${({ $color }) => $color};
  width: ${({ $width }) => $width.toFixed(1)}px;
  flex: 0 0 auto;
`;

export const BarNum = styled.span`
  font-weight: 700;
  min-width: 74px;
  text-align: right;
`;

export const BAR_MAX_WIDTH = 104;

export interface HeatScaleFn {
  at: (value: number) => string;
  atT: (t: number) => string; // normalized 0..1, for the ramp legend
}

// Sequential single-hue scale, light -> dark via alpha over the surface. The
// 0.6 exponent stretches the low end so early months don't all read as blank.
export function makeHeat(min: number, max: number, hex: string): HeatScaleFn {
  const range = max - min;
  const atT = (t: number) => hexToRgba(hex, 0.06 + Math.pow(Math.min(1, Math.max(0, t)), 0.6) * 0.62);
  return {
    atT,
    at: (value) => atT(range > 0 ? (value - min) / range : 0),
  };
}
