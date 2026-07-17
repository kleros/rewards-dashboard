import { useEffect, useState } from "react";
import styled from "styled-components";

import { ProgressState } from "utils/fetchSnapshots";

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  gap: 20px;
`;

const Title = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.accent};
`;

const BarArea = styled.div`
  width: 400px;
  max-width: 90%;
`;

const Meta = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 8px;
  color: ${({ theme }) => theme.secondaryText};
`;

const Track = styled.div`
  height: 6px;
  background: ${({ theme }) => theme.lightGrey};
  border-radius: 3px;
  overflow: hidden;
`;

const Fill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: linear-gradient(90deg, ${({ theme }) => theme.primaryPurple}, ${({ theme }) => theme.secondaryPurple});
  border-radius: 3px;
  transition: width 0.3s ease;
`;

const Current = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.secondaryText};
  margin-top: 8px;
  text-align: center;
`;

export default function FetchProgress({ title, progress }: { title: string; progress: ProgressState }) {
  // Re-render every second so the ETA keeps ticking between batches.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  let eta: string | null = null;
  if (progress.done > 0 && progress.done < progress.total) {
    const elapsed = (Date.now() - progress.startTime) / 1000;
    const remaining = (elapsed / progress.done) * (progress.total - progress.done);
    eta = remaining < 60 ? `${Math.ceil(remaining)}s` : `${Math.floor(remaining / 60)}m ${Math.ceil(remaining % 60)}s`;
  }

  return (
    <Wrap>
      <Title>{title}</Title>
      <BarArea>
        <Meta>
          <span>
            {progress.done}/{progress.total}
          </span>
          <span>{eta ? `~${eta} remaining` : `${pct}%`}</span>
        </Meta>
        <Track>
          <Fill $pct={pct} />
        </Track>
        {progress.current && <Current>{progress.current}</Current>}
      </BarArea>
    </Wrap>
  );
}
