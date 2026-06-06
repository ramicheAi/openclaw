import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "themis-theme";

function read(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem(KEY) as Theme | null;
  if (saved === "light" || saved === "dark") return saved;
  // Default to dark — the BRAIN READY look from the design brief is the
  // premium-instrument identity. User toggle persists in localStorage.
  return "dark";
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => {
    apply(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "light" ? "dark" : "light"))];
}
