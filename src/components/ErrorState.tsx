import styled from "styled-components";

import { PrimaryButton } from "components/Buttons";

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  gap: 14px;
`;

const Title = styled.div`
  color: ${({ theme }) => theme.error};
  font-weight: 600;
  font-size: 16px;
`;

const Message = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.secondaryText};
  max-width: 560px;
  text-align: center;
`;

interface ErrorStateProps {
  message?: string;
  onRetry: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <Wrap>
      <Title>Failed to load data</Title>
      {message && <Message>{message}</Message>}
      <PrimaryButton onClick={onRetry}>Retry</PrimaryButton>
    </Wrap>
  );
}
