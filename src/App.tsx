import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "styled-components";

import Layout from "components/Layout";
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
            <Route path="staking-rewards" element={<StakingRewards />} />
            <Route path="curate-rewards" element={<CurateRewards />} />
            <Route path="poh-rewards" element={<PohRewards />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
