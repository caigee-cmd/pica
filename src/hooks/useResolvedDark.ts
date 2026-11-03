import { useEffect, useState } from "react";
import { usePrefs, type AppearanceMode } from "@/stores/prefs";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Resolve light|dark|system → whether UI should use dark tokens. */
export function resolveDark(appearance: AppearanceMode, systemDark = systemPrefersDark()): boolean {
  if (appearance === "dark") return true;
  if (appearance === "light") return false;
  return systemDark;
}

/** Sync Rakazo tokens + native color-scheme onto <html> (covers dialogs / body scroll / portals). */
export function applyDocumentTheme(dark: boolean) {
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

/** Resolve appearance pref against system color scheme; keep <html> in sync. */
export function useResolvedDark(): boolean {
  const appearance = usePrefs((s) => s.appearance);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const dark = resolveDark(appearance, systemDark);
  useEffect(() => {
    applyDocumentTheme(dark);
  }, [dark]);
  return dark;
}
