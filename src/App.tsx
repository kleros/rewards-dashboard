import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ThemeProvider } from "styled-components";

import Layout from "components/Layout";
import AgentAmbassadors from "pages/AgentAmbassadors";
import CurateRewards from "pages/CurateRewards";
import Home from "pages/Home";
import PohRewards from "pages/PohRewards";
import StakingRewards from "pages/StakingRewards";
import { GlobalStyle } from "styles/global";
import { darkTheme, lightTheme } from "styles/themes";

type ThemeName = "light" | "dark";

function initialTheme(): ThemeName {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// The pages used to live at /<program>-rewards. Netlify answers those paths with
// a 301 before the app loads (netlify.toml); this covers what that rule does not
// see, such as the dev server or a differently cased link, and keeps the query
// string and hash.
function MovedTo({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

export default function App() {
  const [themeName, setThemeName] = useState<ThemeName>(initialTheme);

  const toggleTheme = () =>
    setThemeName((current) => {
      const next = current === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      return next;
    });

  return (
    <ThemeProvider theme={themeName === "dark" ? darkTheme : lightTheme}>
      <GlobalStyle />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout themeName={themeName} toggleTheme={toggleTheme} />}>
            <Route index element={<Home />} />
            <Route path="staking" element={<StakingRewards />} />
            <Route path="curate" element={<CurateRewards />} />
            <Route path="poh" element={<PohRewards />} />
            <Route path="agent-ambassadors" element={<AgentAmbassadors />} />
            <Route path="staking-rewards" element={<MovedTo to="/staking" />} />
            <Route path="curate-rewards" element={<MovedTo to="/curate" />} />
            <Route path="poh-rewards" element={<MovedTo to="/poh" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
