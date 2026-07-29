import { ReactNode } from "react";
import styled from "styled-components";

const Wrap = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
`;

const Titles = styled.div`
  p {
    margin: 0;
    color: ${({ theme }) => theme.secondaryText};
    font-size: 14px;
    line-height: 1.65;
    max-width: 680px;

    strong {
      color: ${({ theme }) => theme.primaryText};
      font-weight: 600;
    }
  }
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 6px;

  h1 {
    margin: 0;
    font-size: 25px;
    letter-spacing: -0.02em;
  }
`;

const Since = styled.span`
  font-size: 11.5px;
  color: ${({ theme }) => theme.secondaryText};
  border: 1px solid ${({ theme }) => theme.stroke};
  border-radius: 999px;
  padding: 5px 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

interface PageHeaderProps {
  title: string;
  description: ReactNode;
  // "Running 4 years 1 month · 49 monthly distributions" pill next to the title.
  badge?: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, description, badge, actions }: PageHeaderProps) {
  return (
    <Wrap>
      <Titles>
        <TitleRow>
          <h1>{title}</h1>
          {badge && <Since>{badge}</Since>}
        </TitleRow>
        <p>{description}</p>
      </Titles>
      {actions && <Actions>{actions}</Actions>}
    </Wrap>
  );
}
