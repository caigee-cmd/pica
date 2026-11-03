import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LoginWindowApp } from "./windows/LoginWindowApp";
import { ScreenWindowApp } from "./windows/ScreenWindowApp";
import { SettingsWindowApp } from "./windows/SettingsWindowApp";
import { MediaWindowApp } from "./windows/MediaWindowApp";
import "./index.css";

/** Before first paint: apply saved appearance so light/dark tokens match (no FOUC). */
(() => {
  try {
    const raw = localStorage.getItem("pica.appearance");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = raw === "dark" || (raw !== "light" && systemDark);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch {
    /* ignore */
  }
})();



function resolveRoot() {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get("window");
  if (kind === "login") return <LoginWindowApp />;
  if (kind === "settings") return <SettingsWindowApp />;
  if (kind === "screen") {
    const botId = params.get("botId")?.trim() ?? "";
    if (!botId) {
      return (
        <div className="flex h-full items-center justify-center bg-[var(--color-paper)] p-6 text-sm text-rose-700">
          Missing botId for screen window.
        </div>
      );
    }
    return <ScreenWindowApp botId={botId} />;
  }
  if (kind === "media") {
    const src = params.get("src")?.trim() ?? "";
    const title = params.get("title")?.trim() || undefined;
    if (!src) {
      return (
        <div className="flex h-full items-center justify-center bg-[var(--color-paper)] p-6 text-sm text-rose-700">
          Missing src for media window.
        </div>
      );
    }
    return <MediaWindowApp src={src} title={title} />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{resolveRoot()}</React.StrictMode>,
);
