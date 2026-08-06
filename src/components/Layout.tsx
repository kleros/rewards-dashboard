import { NavLink, Link, Outlet } from "react-router-dom";
import styled from "styled-components";

import logoUrl from "assets/logo.svg";

const Container = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const Header = styled.header`
  position: sticky;
  top: 0;
  z-index: 100;
  background: ${({ theme }) =>
    theme.name === "dark" ? "rgba(26, 22, 37, 0.88)" : "rgba(30, 7, 95, 0.92)"};
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid #ffffff14;
`;

const HeaderContent = styled.div`
  width: 100%;
  max-width: 1140px;
  margin: 0 auto;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
  min-height: 64px;
`;

const Brand = styled(Link)`
  display: flex;
  align-items: baseline;
  gap: 9px;
  margin-right: auto;
  color: ${({ theme }) => theme.white};
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0.01em;
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.white};
    opacity: 0.88;
  }

  small {
    font-weight: 400;
    font-size: 12px;
    color: ${({ theme }) => theme.lavenderPurple};
  }
`;

const Logo = styled.img`
  height: 22px;
  align-self: center;
`;

const Nav = styled.nav`
  display: flex;
  align-items: center;
  gap: 3px;
  background: #ffffff0f;
  border: 1px solid #ffffff0f;
  border-radius: 11px;
  padding: 3px;

  @media (max-width: 900px) {
    order: 3;
    width: 100%;
  }
`;

const StyledNavLink = styled(NavLink)`
  color: ${({ theme }) => theme.lavenderPurple};
  font-size: 14px;
  padding: 7px 14px;
  border-radius: 8px;
  white-space: nowrap;
  transition: color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.white};
    background: #ffffff14;
  }

  &.active {
    color: ${({ theme }) => theme.darkPurple};
    background: ${({ theme }) => theme.lavenderPurple};
    font-weight: 600;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  }

  @media (max-width: 900px) {
    flex: 1 0 auto;
    text-align: center;
    font-size: 13px;
    padding: 8px 6px;
  }
`;

const ThemeButton = styled.button`
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  background: #ffffff0f;
  border: 1px solid #ffffff1f;
  border-radius: 11px;
  color: ${({ theme }) => theme.white};
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover {
    border-color: #ffffff66;
    background: #ffffff1a;
  }

  &:active {
    background: #ffffff29;
  }
`;

const Main = styled.main`
  flex: 1;
  width: 100%;
  max-width: 1140px;
  margin: 0 auto;
  padding: 28px 20px 48px;
`;

const Footer = styled.footer`
  border-top: 1px solid ${({ theme }) => theme.stroke};
  font-size: 12px;
  color: ${({ theme }) => theme.secondaryText};
`;

const FooterContent = styled.div`
  width: 100%;
  max-width: 1140px;
  margin: 0 auto;
  padding: 14px 20px;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
`;

interface LayoutProps {
  themeName: string;
  toggleTheme: () => void;
}

export default function Layout({ themeName, toggleTheme }: LayoutProps) {
  return (
    <Container>
      <Header>
        <HeaderContent>
          <Brand to="/">
            <Logo src={logoUrl} alt="" /> Kleros Rewards <small>Dashboard</small>
          </Brand>
          <Nav>
            <StyledNavLink to="/staking-rewards">Staking</StyledNavLink>
            <StyledNavLink to="/curate-rewards">Curate</StyledNavLink>
            <StyledNavLink to="/poh-rewards">Proof of Humanity</StyledNavLink>
          </Nav>
          <ThemeButton onClick={toggleTheme} title="Toggle theme">
            {themeName === "dark" ? "☀" : "☾"}
          </ThemeButton>
        </HeaderContent>
      </Header>
      <Main>
        <Outlet />
      </Main>
      <Footer>
        <FooterContent>
          <span>Reward data is fetched from IPFS snapshots and subgraphs published by Kleros.</span>
          <span>
            <a href="https://kleros.io" target="_blank" rel="noreferrer">
              kleros.io
            </a>
          </span>
        </FooterContent>
      </Footer>
    </Container>
  );
}
