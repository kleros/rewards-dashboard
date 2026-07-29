import { useMemo, useState } from "react";
import { useTheme } from "styled-components";

import { formatMonthLabel } from "utils/format";

import {
  ChartContainer,
  TipBox,
  TipKey,
  TipKeyWrap,
  TipRow,
  TipTitle,
  TooltipState,
  columnPath,
  fmtCompact,
  fmtWhole,
  isYearTick,
  niceTicks,
  tipPosition,
  useMeasuredWidth,
  yearOf,
} from "./utils";

export interface ChartSeries {
  name: string;
  color: string;
}

export interface StackPoint {
  label: string; // "YYYY-MM" (or the odd combined bucket)
  values: number[]; // aligned with `series`
  tipNote?: string; // optional suffix for the tooltip title, e.g. "684 entries"
}

interface StackedColumnChartProps {
  points: StackPoint[]; // ascending in time
  series: ChartSeries[];
  height?: number;
  unit?: string; // unit shown on the tooltip total row
}

const PAD_LEFT = 44;
const PAD_RIGHT = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

// The mock's hero chart: thin stacked columns with a 2px surface gap between
// segments, a 4px rounded cap on the topmost segment, hairline gridlines and
// a per-column hover tooltip listing every series.
export default function StackedColumnChart({ points, series, height = 200, unit = "PNK" }: StackedColumnChartProps) {
  const theme = useTheme();
  const [containerRef, width] = useMeasuredWidth();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const { max, ticks } = useMemo(() => {
    const totals = points.map((p) => p.values.reduce((sum, v) => sum + v, 0));
    return niceTicks(Math.max(...totals, 0));
  }, [points]);

  if (points.length === 0) return null;

  const innerWidth = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const innerHeight = height - PAD_TOP - PAD_BOTTOM;
  const band = points.length > 0 ? innerWidth / points.length : 0;
  const barWidth = Math.max(2, Math.min(24, band - 3));
  const y = (v: number) => PAD_TOP + innerHeight - (v / max) * innerHeight;

  function showTip(index: number, x: number, y_: number) {
    const point = points[index];
    const rows = series
      .map((s, k) => ({ ...s, value: point.values[k] ?? 0 }))
      .filter((row) => row.value > 0);
    const total = point.values.reduce((sum, v) => sum + v, 0);
    setHovered(index);
    setTip({
      x,
      y: y_,
      content: (
        <>
          <TipTitle>
            {formatMonthLabel(point.label)}
            {point.tipNote ? ` · ${point.tipNote}` : ""}
          </TipTitle>
          {rows.map((row) => (
            <TipRow key={row.name}>
              <TipKeyWrap>
                <TipKey $color={row.color} />
                {row.name}
              </TipKeyWrap>
              <b>{fmtWhole(row.value)}</b>
            </TipRow>
          ))}
          {series.length > 1 && (
            <TipRow $rule>
              <span>Total</span>
              <b>
                {fmtWhole(total)} {unit}
              </b>
            </TipRow>
          )}
        </>
      ),
    });
  }

  function hideTip() {
    setHovered(null);
    setTip(null);
  }

  return (
    <ChartContainer ref={containerRef}>
      {width > 0 && (
        <svg width={width} height={height} style={{ display: "block", overflow: "visible" }} onMouseLeave={hideTip}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD_LEFT}
                x2={width - PAD_RIGHT}
                y1={y(tick)}
                y2={y(tick)}
                stroke={theme.chartGrid}
                strokeWidth={1}
              />
              <text x={PAD_LEFT - 8} y={y(tick) + 3.5} textAnchor="end" fontSize={9.5} fill={theme.mutedText}>
                {fmtCompact(tick)}
              </text>
            </g>
          ))}
          {points.map((point, i) => {
            const x = PAD_LEFT + i * band + (band - barWidth) / 2;
            const segments = series
              .map((s, k) => ({ value: point.values[k] ?? 0, color: s.color, name: s.name }))
              .filter((seg) => seg.value > 0);
            let acc = 0;
            const total = point.values.reduce((sum, v) => sum + v, 0);
            const label =
              `${formatMonthLabel(point.label)}: ` +
              segments.map((seg) => `${seg.name} ${fmtWhole(seg.value)}`).join(", ") +
              `${segments.length > 1 ? `, total ${fmtWhole(total)}` : ""} ${unit}`;
            return (
              <g key={point.label}>
                {hovered === i && (
                  <rect x={PAD_LEFT + i * band} y={PAD_TOP} width={band} height={innerHeight} fill={theme.hoverBackground} />
                )}
                {segments.map((seg, k) => {
                  const top = y(acc + seg.value);
                  const bottom = y(acc);
                  acc += seg.value;
                  // 2px surface gap above every segment except the topmost,
                  // which instead takes the 4px rounded data-end.
                  const isTop = k === segments.length - 1;
                  const gap = isTop ? 0 : 2;
                  const segY = top + gap;
                  const segHeight = Math.max(1, bottom - top - gap);
                  return (
                    <path key={seg.name} d={columnPath(x, segY, barWidth, segHeight, isTop ? 4 : 0)} fill={seg.color} />
                  );
                })}
                <rect
                  x={PAD_LEFT + i * band}
                  y={PAD_TOP}
                  width={band}
                  height={innerHeight}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={label}
                  style={{ outline: "none" }}
                  onMouseMove={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (rect) showTip(i, e.clientX - rect.left, e.clientY - rect.top);
                  }}
                  onFocus={() => showTip(i, PAD_LEFT + i * band + band / 2, PAD_TOP)}
                  onBlur={hideTip}
                />
                {isYearTick(point.label, i) && (
                  <text
                    x={x + barWidth / 2}
                    y={height - 6}
                    textAnchor="middle"
                    fontSize={9.5}
                    fill={theme.mutedText}
                  >
                    {yearOf(point.label)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {tip && <TipBox style={tipPosition(tip, width)}>{tip.content}</TipBox>}
    </ChartContainer>
  );
}
