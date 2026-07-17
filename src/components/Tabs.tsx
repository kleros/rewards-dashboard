import styled from "styled-components";

const Bar = styled.div`
  display: flex;
  gap: 2px;
  overflow-x: auto;
  border-bottom: 1px solid ${({ theme }) => theme.stroke};
  margin-bottom: 16px;
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 9px 14px;
  font-size: 13px;
  white-space: nowrap;
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 2px solid ${({ theme, $active }) => ($active ? theme.accent : "transparent")};
  color: ${({ theme, $active }) => ($active ? theme.accent : theme.secondaryText)};
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  transition: color 0.15s ease, border-color 0.15s ease;

  &:hover {
    color: ${({ theme, $active }) => ($active ? theme.accent : theme.primaryText)};
  }
`;

interface TabsProps {
  tabs: string[];
  active: string;
  onSelect: (tab: string) => void;
}

export default function Tabs({ tabs, active, onSelect }: TabsProps) {
  return (
    <Bar>
      {tabs.map((tab) => (
        <Tab key={tab} $active={tab === active} onClick={() => onSelect(tab)}>
          {tab}
        </Tab>
      ))}
    </Bar>
  );
}
