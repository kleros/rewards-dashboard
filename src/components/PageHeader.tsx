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
  h1 {
    margin: 0 0 4px;
    font-size: 25px;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.secondaryText};
    font-size: 14px;
    max-width: 640px;
  }
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Wrap>
      <Titles>
        <h1>{title}</h1>
        <p>{description}</p>
      </Titles>
      {actions && <Actions>{actions}</Actions>}
    </Wrap>
  );
}
