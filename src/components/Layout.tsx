import { NavLink, Link, Outlet } from "react-router-dom";
import styled from "styled-components";

const Container = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const Header = styled.header`
  background: ${({ theme }) => theme.navbarBackground};
`;

const HeaderContent = styled.div`
  width: 100%;
  max-width: 1140px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 60px;
`;

const Brand = styled(Link)`
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: ${({ theme }) => theme.white};
  font-weight: 700;
  font-size: 18px;
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.white};
    opacity: 0.9;
  }

  small {
    font-weight: 400;
    font-size: 12px;
    color: ${({ theme }) => theme.lavenderPurple};
  }
`;

const Nav = styled.nav`
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
`;

const StyledNavLink = styled(NavLink)`
  color: ${({ theme }) => theme.lavenderPurple};
  font-size: 14px;
  padding: 6px 9px;
  border-radius: 7px;
  white-space: nowrap;
  transition: color 0.15s ease, background 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.white};
    background: #ffffff14;
  }

  &.active {
    color: ${({ theme }) => theme.white};
    background: #ffffff1f;
    font-weight: 600;
  }
`;

const ThemeButton = styled.button`
  background: none;
  border: 1px solid #ffffff42;
  border-radius: 7px;
  color: ${({ theme }) => theme.white};
  font-size: 18px;
  line-height: 1;
  padding: 5px 9px;
  margin-left: 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.white};
    background: #ffffff14;
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
            ⚖️ Kleros Rewards <small>Dashboard</small>
          </Brand>
          <Nav>
            <StyledNavLink to="/staking-rewards">Staking Rewards</StyledNavLink>
            <StyledNavLink to="/curate-rewards">Curate Rewards</StyledNavLink>
            <ThemeButton onClick={toggleTheme} title="Toggle theme">
              {themeName === "dark" ? "☀" : "☾"}
            </ThemeButton>
          </Nav>
        </HeaderContent>
      </Header>
      <Main>
        <Outlet />
      </Main>
      <Footer>
        <FooterContent>
          <span>Reward data is fetched from IPFS snapshots published by Kleros.</span>
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
