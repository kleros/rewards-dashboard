// The pure parts of RewardsTable: how its rows sort, and how a row whose
// cells may cover several columns is laid out.

export type CellValue = string | bigint;
export type Row = Record<string, CellValue>;

function compareCells(a: CellValue, b: CellValue): number {
  if (typeof a === "bigint" && typeof b === "bigint") return a < b ? -1 : a > b ? 1 : 0;
  return String(a).localeCompare(String(b));
}

// The rows sorted by one column, ascending or descending. A row with no value
// in that column (an amount that isn't known, like a month's ATQ that cannot
// be split) goes last either way.
export function sortRows(rows: Row[], key: string, ascending: boolean): Row[] {
  const dir = ascending ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key] as CellValue | undefined;
    const y = b[key] as CellValue | undefined;
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1;
    return dir * compareCells(x, y);
  });
}

// Lays out a table row whose cells may cover several columns: given the
// number of columns and the span asked at a column, the [column, span] of
// each cell drawn, left to right. A span is a whole number of at least 1 and
// never more than the columns left in the row; the columns a cell covers get
// no cell of their own.
export function layoutSpans(count: number, spanAt: (column: number) => number | undefined): [number, number][] {
  const cells: [number, number][] = [];
  for (let column = 0; column < count; ) {
    const asked = Math.floor(spanAt(column) ?? 1);
    const span = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), count - column) : 1;
    cells.push([column, span]);
    column += span;
  }
  return cells;
}
