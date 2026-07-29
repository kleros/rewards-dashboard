import { RefObject, useEffect, useRef, useState } from "react";
import styled from "styled-components";

// Measure a container's width with a ResizeObserver so SVG charts render at
// real pixel size (stretching a viewBox with preserveAspectRatio="none" would
// distort the axis text).
export function useMeasuredWidth(): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// Round y-axis ticks to clean numbers: pick a 1/2/2.5/5 x 10^k step aiming for
// ~`target` gridlines, and extend the max up to the next step boundary.
export function niceTicks(maxValue: number, target = 4): { max: number; ticks: number[] } {
  if (!(maxValue > 0)) return { max: 1, ticks: [0, 1] };
  const rough = maxValue / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const max = Math.ceil(maxValue / step) * step;
  const ticks = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(v);
  return { max, ticks };
}

// "300k" / "1.2M" style axis labels.
export function fmtCompact(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1e6) {
    const m = value / 1e6;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1e3) {
    const k = value / 1e3;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(Math.round(value));
}

export function fmtWhole(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Year label under the first column and under every January.
export function isYearTick(label: string, index: number): boolean {
  return index === 0 || /^\d{4}-01$/.test(label);
}

export const yearOf = (label: string): string => label.split("-")[0] ?? label;

// Rounded-top column path: 4px radius at the data end, square at the baseline.
export function columnPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return [
    `M${x.toFixed(1)} ${(y + r).toFixed(1)}`,
    `a${r} ${r} 0 0 1 ${r} -${r}`,
    `h${(width - 2 * r).toFixed(1)}`,
    `a${r} ${r} 0 0 1 ${r} ${r}`,
    `v${(height - r).toFixed(1)}`,
    `h-${width.toFixed(1)}`,
    "z",
  ].join(" ");
}

// ---- shared hover tooltip -------------------------------------------------

export interface TooltipState {
  x: number; // px, relative to the chart container
  y: number;
  content: React.ReactNode;
}

export const ChartContainer = styled.div`
  position: relative;
  width: 100%;
`;

export const TipBox = styled.div`
  position: absolute;
  pointer-events: none;
  z-index: 5;
  background: ${({ theme }) => (theme.name === "dark" ? "#241F31" : theme.white)};
  border: 1px solid ${({ theme }) => theme.stroke};
  border-radius: 9px;
  padding: 9px 12px;
  font-size: 11.5px;
  white-space: nowrap;
  box-shadow: 0 8px 24px ${({ theme }) => theme.hoveredShadow};
  color: ${({ theme }) => theme.secondaryText};
`;

export const TipTitle = styled.div`
  font-weight: 700;
  margin-bottom: 5px;
  font-size: 12px;
  color: ${({ theme }) => theme.primaryText};
`;

export const TipRow = styled.div<{ $rule?: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  line-height: 1.7;

  b {
    color: ${({ theme }) => theme.primaryText};
    font-weight: 600;
  }

  ${({ $rule, theme }) =>
    $rule &&
    `
  margin-top: 5px;
  border-top: 1px solid ${theme.stroke};
  padding-top: 5px;
  `}
`;

export const TipKeyWrap = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

// Tooltip rows key their series with a short stroke of the series color.
export const TipKey = styled.i<{ $color: string }>`
  width: 10px;
  height: 3px;
  border-radius: 2px;
  display: inline-block;
  background: ${({ $color }) => $color};
`;

const TIP_WIDTH = 190;

// Clamp the tooltip inside the measured container and keep it above the cursor.
export function tipPosition(tip: TooltipState, containerWidth: number): { left: number; top: number } {
  return {
    left: Math.max(0, Math.min(tip.x + 14, containerWidth - TIP_WIDTH)),
    top: Math.max(0, tip.y - 14),
  };
}
