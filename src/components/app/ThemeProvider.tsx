"use client";

import { useLayoutEffect } from "react";

const THEME_KEY = "trainer-theme";
const DEFAULT_THEME = "linen";
const DENSITY_KEY = "trainer-density";
const MONO_KEY = "trainer-mono";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME;
    const html = document.documentElement;
    html.setAttribute("data-theme", saved);
    html.setAttribute("data-density", localStorage.getItem(DENSITY_KEY) ?? "default");
    html.setAttribute("data-mono", localStorage.getItem(MONO_KEY) ?? "jetbrains");
    html.setAttribute("data-units", "lb");
    html.setAttribute("data-compact-cells", "off");
    html.setAttribute("data-rails", "on");
    html.setAttribute("data-spark", "off");
    html.setAttribute("data-save-mode", "discrete");
  }, []);

  return <>{children}</>;
}

export function setTheme(theme: string) {
  if (typeof window === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

export function setDensity(density: "comfy" | "default" | "dense") {
  if (typeof window === "undefined") return;
  document.documentElement.setAttribute("data-density", density);
  localStorage.setItem(DENSITY_KEY, density);
}

export function setMono(mono: "jetbrains" | "system") {
  if (typeof window === "undefined") return;
  document.documentElement.setAttribute("data-mono", mono);
  localStorage.setItem(MONO_KEY, mono);
}
