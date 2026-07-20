import styled from "styled-components";

// Presentational primitives shared by the reward pages (PohRewards, CurateRewards):
// the footnote under the main table plus the wallet drill-down's detail card.

export const Foot = styled.div`
  margin-top: 16px;
  color: ${({ theme }) => theme.secondaryText};
  font-size: 12px;
`;

export const DetailCard = styled.div`
  background: ${({ theme }) => theme.whiteBackground};
  border: 1px solid ${({ theme }) => theme.stroke};
  border-radius: 12px;
  overflow: hidden;
`;

export const DetailHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid ${({ theme }) => theme.stroke};
`;

export const MutedLabel = styled.div`
  color: ${({ theme }) => theme.secondaryText};
  font-size: 12px;
`;

export const GrandTotal = styled.div`
  font-size: 20px;
  font-weight: 700;
`;

export const PeriodBlock = styled.div`
  padding: 6px 16px 14px;

  h4 {
    margin: 14px 0 6px;
    font-size: 13px;
    color: ${({ theme }) => theme.secondaryText};
  }
`;

export const LinesTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  td {
    padding: 7px 10px 7px 0;
    border-bottom: 1px solid ${({ theme }) => theme.stroke};
    white-space: nowrap;
    transition: background 0.12s ease;
  }

  tr:hover td {
    background: ${({ theme }) => theme.hoverBackground};
  }

  tr:last-child td {
    border-bottom: none;
  }
`;

export const NumCell = styled.td`
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

export const BackRow = styled.div`
  margin-bottom: 14px;
`;
