import { createContext, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  resolvedTheme: "light",
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: user } = useQuery<User>({ queryKey: ["/api/user"] });
  const [theme, setThemeState] = useState<Theme>("light");

  const getSystemTheme = (): "light" | "dark" =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  const resolvedTheme: "light" | "dark" = theme === "system" ? getSystemTheme() : theme;

  // Sync from user preference on load
  useEffect(() => {
    if (user?.theme) {
      setThemeState(user.theme as Theme);
    }
  }, [user?.theme]);

  // Also load from localStorage immediately on mount
  useEffect(() => {
    const stored = localStorage.getItem("leveltrack-theme") as Theme | null;
    if (stored) setThemeState(stored);
  }, []);

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolvedTheme]);

  // Also listen to system theme changes
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const root = document.documentElement;
      if (getSystemTheme() === "dark") root.classList.add("dark");
      else root.classList.remove("dark");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("leveltrack-theme", t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
