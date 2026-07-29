import { useMemo, useState } from "react";
import { useTheme } from "styled-components";

import { formatMonthLabel } from "utils/format";

import {
  ChartContainer,
  TipBox,
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

export interface MiniPoint {
  label: string;
  value: number | null; // null = unknown for that month (renders as a gap)
}

interface MiniChartProps {
  points: MiniPoint[]; // ascending in time
  kind: "column" | "line";
  color: string;
  name: string; // series name for tooltips / aria labels
  height?: number;
  format?: (value: number) => string;
}

const PAD_LEFT = 40;
const PAD_RIGHT = 44; // room for the end label
const PAD_TOP = 8;
const PAD_BOTTOM = 20;

// The mock's small multiples: a single-series column or line chart sharing the
// hero chart's timeline, with the final value direct-labeled at the end.
export default function MiniChart({ points, kind, color, name, height = 150, format = fmtWhole }: MiniChartProps) {
  const theme = useTheme();
  const [containerRef, width] = useMeasuredWidth();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const { max, ticks } = useMemo(
    () => niceTicks(Math.max(...points.map((p) => p.value ?? 0), 0)),
    [points]
  );

  if (points.length === 0) return null;

  const innerWidth = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const innerHeight = height - PAD_TOP - PAD_BOTTOM;
  const band = innerWidth / points.length;
  const y = (v: number) => PAD_TOP + innerHeight - (v / max) * innerHeight;
  const centerX = (i: number) => PAD_LEFT + i * band + band / 2;

  // Break the line into runs at unknown months instead of bridging them.
  const runs: { x: number; y: number }[][] = [];
  if (kind === "line") {
    let current: { x: number; y: number }[] = [];
    points.forEach((point, i) => {
      if (point.value === null) {
        if (current.length > 0) runs.push(current);
        current = [];
      } else {
        current.push({ x: centerX(i), y: y(point.value) });
      }
    });
    if (current.length > 0) runs.push(current);
  }

  const lastKnownIndex = points.reduce((acc, p, i) => (p.value !== null ? i : acc), -1);
  const lastKnown = lastKnownIndex >= 0 ? points[lastKnownIndex] : null;

  function showTip(index: number, x: number, y_: number) {
    const point = points[index];
    setHovered(index);
    setTip({
      x,
      y: y_,
      content: (
        <>
          <TipTitle>{formatMonthLabel(point.label)}</TipTitle>
          <TipRow>
            <span>{name}</span>
            <b>{point.value === null ? "—" : format(point.value)}</b>
          </TipRow>
        </>
      ),
    });
  }

  function hideTip() {
    setHovered(null);
    setTip(null);
  }

  const barWidth = Math.max(2, Math.min(24, band - 2.4));

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
              <text x={PAD_LEFT - 7} y={y(tick) + 3.5} textAnchor="end" fontSize={9.5} fill={theme.mutedText}>
                {fmtCompact(tick)}
              </text>
            </g>
          ))}
          {hovered !== null && (
            <rect
              x={PAD_LEFT + hovered * band}
              y={PAD_TOP}
              width={band}
              height={innerHeight}
              fill={theme.hoverBackground}
            />
          )}
          {kind === "column" &&
            points.map(
              (point, i) =>
                point.value !== null &&
                point.value > 0 && (
                  <path
                    key={point.label}
                    d={columnPath(
                      PAD_LEFT + i * band + (band - barWidth) / 2,
                      y(point.value),
                      barWidth,
                      Math.max(1, PAD_TOP + innerHeight - y(point.value)),
                      4
                    )}
                    fill={color}
                  />
                )
            )}
          {kind === "line" &&
            runs.map((run, r) =>
              run.length === 1 ? (
                <circle key={r} cx={run[0].x} cy={run[0].y} r={3} fill={color} />
              ) : (
                <polyline
                  key={r}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={run.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                />
              )
            )}
          {kind === "line" && lastKnown && lastKnown.value !== null && (
            // End marker with a 2px surface ring so it stays legible on the line.
            <circle
              cx={centerX(lastKnownIndex)}
              cy={y(lastKnown.value)}
              r={4}
              fill={color}
              stroke={theme.whiteBackground}
              strokeWidth={2}
            />
          )}
          {lastKnown && lastKnown.value !== null && (
            // Direct label on the final value only; ink token, never the series color.
            <text
              x={centerX(lastKnownIndex) + (kind === "line" ? 9 : barWidth / 2 + 6)}
              y={y(lastKnown.value) + 4}
              fontSize={11}
              fontWeight={700}
              fill={theme.primaryText}
            >
              {format(lastKnown.value)}
            </text>
          )}
          {points.map((point, i) => (
            <g key={`hit-${point.label}`}>
              <rect
                x={PAD_LEFT + i * band}
                y={PAD_TOP}
                width={band}
                height={innerHeight}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${formatMonthLabel(point.label)}: ${name} ${point.value === null ? "unknown" : format(point.value)}`}
                style={{ outline: "none" }}
                onMouseMove={(e) => {
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (rect) showTip(i, e.clientX - rect.left, e.clientY - rect.top);
                }}
                onFocus={() => showTip(i, centerX(i), PAD_TOP)}
                onBlur={hideTip}
              />
              {isYearTick(point.label, i) && (
                <text x={centerX(i)} y={height - 5} textAnchor="middle" fontSize={9.5} fill={theme.mutedText}>
                  {yearOf(point.label)}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
      {tip && <TipBox style={tipPosition(tip, width)}>{tip.content}</TipBox>}
    </ChartContainer>
  );
}
