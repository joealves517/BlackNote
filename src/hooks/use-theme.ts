import { useState, useEffect, useCallback } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function useTheme() {
  // 1. Load configured theme mode from localStorage, default to "system"
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("blacknote-theme-mode") as ThemeMode | null;
      if (stored) return stored;
      
      // Fallback to old key if exists to avoid breaking change
      const oldStored = localStorage.getItem("blacknote-theme") as "light" | "dark" | null;
      if (oldStored) return oldStored;
      
      return "system";
    }
    return "system";
  });

  // 2. State for the actual active theme applied to document
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof window !== "undefined") {
      if (themeMode === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      return themeMode as ResolvedTheme;
    }
    return "light";
  });

  // 3. Track media query changes when in "system" mode
  useEffect(() => {
    if (themeMode !== "system") {
      setResolvedTheme(themeMode as ResolvedTheme);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setResolvedTheme(mediaQuery.matches ? "dark" : "light");
    };

    // Initialize
    handleChange();

    // Listen for OS preference changes
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [themeMode]);

  // 4. Apply actual resolved theme class to document element
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  // 5. Update localStorage when mode changes
  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem("blacknote-theme-mode", mode);
  }, []);

  // 6. Manual quick toggle from toolbar: switches Light <-> Dark, overrides system
  const toggleTheme = useCallback(() => {
    setThemeModeState((prevMode) => {
      // Determine what to switch to based on currently resolved theme
      const nextTheme = resolvedTheme === "light" ? "dark" : "light";
      localStorage.setItem("blacknote-theme-mode", nextTheme);
      return nextTheme;
    });
  }, [resolvedTheme]);

  return { 
    themeMode, 
    resolvedTheme, 
    theme: resolvedTheme, // Keep 'theme' property alias for backward compatibility!
    setThemeMode, 
    toggleTheme 
  };
}
