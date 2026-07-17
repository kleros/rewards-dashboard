import { Link } from "react-router-dom";
import styled from "styled-components";

const Hero = styled.div`
  margin: 24px 0 32px;

  h1 {
    font-size: 32px;
    letter-spacing: -0.02em;
    margin-bottom: 8px;
  }

  p {
    color: ${({ theme }) => theme.secondaryText};
    max-width: 640px;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
`;

const SectionCard = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: ${({ theme }) => theme.whiteBackground};
  border: 1px solid ${({ theme }) => theme.stroke};
  border-radius: 14px;
  padding: 22px 24px;
  color: inherit;
  transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.accent};
    transform: translateY(-2px);
    box-shadow: 0 6px 18px ${({ theme }) => theme.hoveredShadow};
    color: inherit;
  }

  &:active {
    transform: translateY(0);
  }
`;

const Eyebrow = styled.span`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.accent};
  font-weight: 600;
`;

const CardTitle = styled.span`
  font-size: 20px;
  font-weight: 700;
`;

const CardDescription = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.secondaryText};
  flex: 1;
`;

const Browse = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.accent};
`;

const ComingSoon = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px dashed ${({ theme }) => theme.stroke};
  border-radius: 14px;
  padding: 22px 24px;
  color: ${({ theme }) => theme.secondaryText};
`;

const SECTIONS = [
  {
    to: "/staking-rewards",
    eyebrow: "Juror incentive program",
    title: "Staking Rewards",
    description:
      "Monthly PNK rewards for jurors staking in Kleros Court, distributed on Ethereum Mainnet and Gnosis since January 2021.",
  },
  {
    to: "/curate-rewards",
    eyebrow: "Curator incentive program",
    title: "Curate Rewards",
    description:
      "Monthly PNK rewards for submissions, removals and ATQ across the Address Tags, Tokens and Domains registries, distributed on Gnosis since April 2022.",
  },
];

export default function Home() {
  return (
    <div>
      <Hero>
        <h1>Kleros Rewards</h1>
        <p>
          Browse the rewards Kleros has distributed to its community since inception. Pick a reward program below to
          explore monthly distributions, per-wallet totals, and downloadable exports.
        </p>
      </Hero>
      <Grid>
        {SECTIONS.map((section) => (
          <SectionCard key={section.to} to={section.to}>
            <Eyebrow>{section.eyebrow}</Eyebrow>
            <CardTitle>{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
            <Browse>Browse →</Browse>
          </SectionCard>
        ))}
        <ComingSoon>
          <Eyebrow as="span" style={{ opacity: 0.6 }}>
            Coming soon
          </Eyebrow>
          <CardTitle>More reward programs</CardTitle>
          <CardDescription>Other historical Kleros reward distributions will be added here over time.</CardDescription>
        </ComingSoon>
      </Grid>
    </div>
  );
}
