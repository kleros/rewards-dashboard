import styled from "styled-components";

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 22px;
`;

const Card = styled.div`
  flex: 1 1 160px;
  background: ${({ theme }) => theme.whiteBackground};
  border: 1px solid ${({ theme }) => theme.stroke};
  border-radius: 12px;
  padding: 13px 16px;
`;

const K = styled.div`
  color: ${({ theme }) => theme.secondaryText};
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const V = styled.div`
  font-size: 19px;
  font-weight: 700;
  margin-top: 4px;
  white-space: nowrap;
`;

export interface Stat {
  label: string;
  value: string;
}

export default function StatsRow({ stats }: { stats: Stat[] }) {
  return (
    <Row>
      {stats.map(({ label, value }) => (
        <Card key={label}>
          <K>{label}</K>
          <V>{value}</V>
        </Card>
      ))}
    </Row>
  );
}
