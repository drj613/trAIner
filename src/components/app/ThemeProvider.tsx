"use client";

import { useLayoutEffect } from "react";

const THEME_KEY = "trainer-theme";
const DEFAULT_THEME = "linen";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME;
    const html = document.documentElement;
    html.setAttribute("data-theme", saved);
    html.setAttribute("data-density", "default");
    html.setAttribute("data-mono", "jetbrains");
    html.setAttribute("data-units", "lb");
    html.setAttribute("data-compact-cells", "off");
    html.setAttribute("data-rails", "on");
    html.setAttribute("data-spark", "off");
    html.setAttribute("data-save-mode", "discrete");
  }, []);

  return <>{children}</>;
}

export function setTheme(theme: string) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}
