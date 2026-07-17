import styled from "styled-components";

export const PrimaryButton = styled.button`
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  border-radius: 9px;
  cursor: pointer;
  color: ${({ theme }) => theme.textOnPrimary};
  background: ${({ theme }) => theme.primaryBlue};
  transition: background 0.15s ease, filter 0.1s ease;

  &:hover {
    background: ${({ theme }) => theme.secondaryBlue};
  }

  &:active {
    filter: brightness(0.92);
  }
`;

export const SecondaryButton = styled.button`
  padding: 9px 16px;
  font-size: 13px;
  border-radius: 9px;
  cursor: pointer;
  border: 1px solid ${({ theme }) => theme.stroke};
  background: ${({ theme }) => theme.whiteBackground};
  color: ${({ theme }) => theme.primaryText};
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.accent};
    background: ${({ theme }) => theme.hoverBackground};
  }

  &:active {
    background: ${({ theme }) => theme.activeBackground};
  }
`;
