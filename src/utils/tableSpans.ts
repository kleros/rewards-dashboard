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
