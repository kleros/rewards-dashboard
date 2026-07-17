import { ReactNode, useEffect, useMemo, useState } from "react";
import styled from "styled-components";

import { PAGE_SIZE } from "consts/index";
import { formatPNK } from "utils/format";

export type CellValue = string | bigint;
export type Row = Record<string, CellValue>;

export interface Column {
  key: string;
  label: string;
  align?: "left" | "right";
  render?: (row: Row) => ReactNode;
}

const Controls = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
`;

const SearchInput = styled.input`
  flex: 1 1 300px;
  max-width: 380px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.stroke};
  background: ${({ theme }) => theme.whiteBackground};
  color: ${({ theme }) => theme.primaryText};
  font-family: inherit;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.strokeHover};
  }

  &:focus {
    border-color: ${({ theme }) => theme.accent};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.accent}26;
  }
`;

const Count = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.secondaryText};
  white-space: nowrap;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.whiteBackground};
  border: 1px solid ${({ theme }) => theme.stroke};
  border-radius: 12px;
  overflow: hidden;
`;

const Scroll = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 560px;
  font-size: 13px;
`;

const Th = styled.th<{ $align: "left" | "right" }>`
  text-align: ${({ $align }) => $align};
  padding: 11px 16px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.secondaryText};
  background: ${({ theme }) => (theme.name === "dark" ? theme.mediumPurple : theme.lightPurple)};
  border-bottom: 1px solid ${({ theme }) => theme.stroke};
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.primaryText};
  }
`;

const Td = styled.td<{ $align: "left" | "right"; $zero?: boolean }>`
  text-align: ${({ $align }) => $align};
  padding: 9px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.stroke};
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: ${({ theme, $zero }) => ($zero ? theme.secondaryText : theme.primaryText)};
`;

const Tr = styled.tr<{ $clickable: boolean }>`
  cursor: ${({ $clickable }) => ($clickable ? "pointer" : "default")};

  td {
    transition: background 0.12s ease;
  }

  &:last-child td {
    border-bottom: none;
  }

  &:hover td {
    background: ${({ theme }) => theme.hoverBackground};
  }

  ${({ $clickable, theme }) =>
    $clickable &&
    `
  &:active td {
    background: ${theme.activeBackground};
  }
  `}
`;

export const Mono = styled.span`
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
`;

const Empty = styled.div`
  padding: 32px 16px;
  text-align: center;
  color: ${({ theme }) => theme.secondaryText};
`;

const Pager = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-top: 1px solid ${({ theme }) => theme.stroke};
  font-size: 12px;
  color: ${({ theme }) => theme.secondaryText};
`;

const PagerButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const PageButton = styled.button`
  padding: 4px 11px;
  font-size: 12px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.stroke};
  background: ${({ theme }) => theme.whiteBackground};
  color: ${({ theme }) => theme.primaryText};
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.accent};
    background: ${({ theme }) => theme.hoverBackground};
  }

  &:active:not(:disabled) {
    background: ${({ theme }) => theme.activeBackground};
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

function compareCells(a: CellValue, b: CellValue): number {
  if (typeof a === "bigint" && typeof b === "bigint") return a < b ? -1 : a > b ? 1 : 0;
  return String(a).localeCompare(String(b));
}

interface RewardsTableProps {
  columns: Column[];
  rows: Row[];
  searchPlaceholder?: string;
  noun?: [singular: string, plural: string];
  onRowClick?: (row: Row) => void;
  defaultSortKey?: string;
}

export default function RewardsTable({
  columns,
  rows,
  searchPlaceholder = "Search...",
  noun = ["address", "addresses"],
  onRowClick,
  defaultSortKey,
}: RewardsTableProps) {
  const lastKey = columns[columns.length - 1].key;
  const [sortKey, setSortKey] = useState(defaultSortKey ?? lastKey);
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const searchKey = columns[0].key;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => String(row[searchKey] ?? "").toLowerCase().includes(q));
  }, [rows, search, searchKey]);

  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => dir * compareCells(a[sortKey], b[sortKey]));
  }, [filtered, sortKey, sortAsc]);

  useEffect(() => {
    setPage(0);
  }, [rows, search, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function handleSort(key: string) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      // Text columns start ascending, numeric columns start with the largest amounts.
      setSortAsc(key === searchKey);
    }
  }

  return (
    <div>
      <Controls>
        <SearchInput
          type="search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Count>
          {filtered.length.toLocaleString()} {filtered.length === 1 ? noun[0] : noun[1]}
        </Count>
      </Controls>
      <Card>
        <Scroll>
          <Table>
            <thead>
              <tr>
                {columns.map((col) => (
                  <Th key={col.key} $align={col.align ?? "left"} onClick={() => handleSort(col.key)}>
                    {col.label}
                    {sortKey === col.key ? (sortAsc ? " ↑" : " ↓") : ""}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length}>
                    <Empty>No rows{search ? " match your search" : ""}.</Empty>
                  </td>
                </tr>
              ) : (
                pageRows.map((row, i) => (
                  <Tr key={i} $clickable={!!onRowClick} onClick={() => onRowClick?.(row)}>
                    {columns.map((col) => {
                      const value = row[col.key];
                      return (
                        <Td key={col.key} $align={col.align ?? "left"} $zero={value === 0n}>
                          {col.render ? col.render(row) : typeof value === "bigint" ? formatPNK(value) : value}
                        </Td>
                      );
                    })}
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </Scroll>
        {totalPages > 1 && (
          <Pager>
            <span>
              {(safePage * PAGE_SIZE + 1).toLocaleString()}–
              {Math.min((safePage + 1) * PAGE_SIZE, sorted.length).toLocaleString()} of{" "}
              {sorted.length.toLocaleString()}
            </span>
            <PagerButtons>
              <PageButton disabled={safePage === 0} onClick={() => setPage(0)}>
                «
              </PageButton>
              <PageButton disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                ‹ Prev
              </PageButton>
              <span>
                {safePage + 1} / {totalPages}
              </span>
              <PageButton
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next ›
              </PageButton>
              <PageButton disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
                »
              </PageButton>
            </PagerButtons>
          </Pager>
        )}
      </Card>
    </div>
  );
}
