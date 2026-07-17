import { createGlobalStyle } from "styled-components";

export const GlobalStyle = createGlobalStyle`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    scrollbar-gutter: stable;
  }

  body {
    background: ${({ theme }) => theme.lightBackground};
    color: ${({ theme }) => theme.primaryText};
    font-family: "Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.5;
    transition: background 0.25s ease;
  }

  button {
    font-family: inherit;
  }

  a {
    color: ${({ theme }) => theme.primaryBlue};
    text-decoration: none;
    transition: color 0.15s ease;
  }

  a:hover {
    color: ${({ theme }) => theme.secondaryBlue};
  }

  :focus-visible {
    outline: 2px solid ${({ theme }) => theme.accent};
    outline-offset: 2px;
    border-radius: 4px;
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.stroke};
    border-radius: 4px;
  }
`;
