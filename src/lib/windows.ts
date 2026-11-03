import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isMac, isTauri } from "@/lib/platform";

export const SETTINGS_LABEL = "settings";
export const SCREEN_LABEL = "screen";
export const LOGIN_LABEL = "login";
export const MAIN_LABEL = "main";
export const MEDIA_LABEL = "media";

/** Build a same-origin URL for a child webview (dev localhost or prod asset origin). */
export function buildChildWindowUrl(params: Record<string, string>): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

type Focusable = {
  show: () => Promise<void>;
  unminimize: () => Promise<void>;
  setFocus: () => Promise<void>;
};

async function focusWindow(win: Focusable): Promise<void> {
  await win.show();
  await win.unminimize();
  await win.setFocus();
}

/** Child windows use native decorations; macOS Overlay + hiddenTitle for drag chrome. */
function childDecorations(): {
  decorations: boolean;
  titleBarStyle?: "overlay";
  hiddenTitle?: boolean;
} {
  if (isMac) {
    return {
      decorations: true,
      titleBarStyle: "overlay",
      hiddenTitle: true,
    };
  }
  // Win/Linux: keep OS title bar (no ActionBar) — avoids fighting native controls.
  return { decorations: true };
}

async function destroyIfPresent(label: string): Promise<void> {
  const existing = await WebviewWindow.getByLabel(label);
  if (!existing) return;
  await existing.close();
  // Brief yield so the label is free before recreate.
  await new Promise((r) => setTimeout(r, 50));
}

/**
 * Open (or focus) the Settings OS window.
 * Throws when not running under Tauri so callers can fall back to inline Settings.
 */
export async function openSettingsWindow(): Promise<void> {
  if (!isTauri) throw new Error("Not running in Tauri");

  const existing = await WebviewWindow.getByLabel(SETTINGS_LABEL);
  if (existing) {
    await focusWindow(existing);
    return;
  }

  const win = new WebviewWindow(SETTINGS_LABEL, {
    url: buildChildWindowUrl({ window: "settings" }),
    title: "Settings",
    width: 520,
    height: 640,
    minWidth: 420,
    minHeight: 480,
    center: true,
    visible: true,
    resizable: true,
    focus: true,
    ...childDecorations(),
  });

  await new Promise<void>((resolve, reject) => {
    void win.once("tauri://created", () => resolve());
    void win.once("tauri://error", (event) => {
      reject(new Error(String(event.payload ?? "Failed to create settings window")));
    });
  });
}

/**
 * Open (or recreate) the Computer / screen pop-out window for a bot.
 * One `screen` label — switching bots destroys and recreates with a new query.
 */
export async function openScreenWindow(botId: string): Promise<void> {
  if (!isTauri) throw new Error("Not running in Tauri");
  if (!botId) throw new Error("botId required");

  const existing = await WebviewWindow.getByLabel(SCREEN_LABEL);
  if (existing) {
    // Recreate so `?botId=` is correct (separate JS context; no shared router).
    await destroyIfPresent(SCREEN_LABEL);
  }

  const win = new WebviewWindow(SCREEN_LABEL, {
    url: buildChildWindowUrl({ window: "screen", botId }),
    title: "Computer",
    width: 900,
    height: 700,
    minWidth: 640,
    minHeight: 480,
    center: true,
    visible: true,
    resizable: true,
    focus: true,
    ...childDecorations(),
  });

  await new Promise<void>((resolve, reject) => {
    void win.once("tauri://created", () => resolve());
    void win.once("tauri://error", (event) => {
      reject(new Error(String(event.payload ?? "Failed to create screen window")));
    });
  });
}


/** Compact HuLa-style login window (Existing instance + Better Auth). */
export async function openLoginWindow(): Promise<void> {
  if (!isTauri) throw new Error("Not running in Tauri");

  const existing = await WebviewWindow.getByLabel(LOGIN_LABEL);
  if (existing) {
    await focusWindow(existing);
    return;
  }

  const win = new WebviewWindow(LOGIN_LABEL, {
    url: buildChildWindowUrl({ window: "login" }),
    title: "登录",
    width: 360,
    height: 560,
    minWidth: 320,
    minHeight: 480,
    center: true,
    visible: true,
    resizable: false,
    focus: true,
    ...childDecorations(),
  });

  await new Promise<void>((resolve, reject) => {
    void win.once("tauri://created", () => resolve());
    void win.once("tauri://error", (event) => {
      reject(new Error(String(event.payload ?? "Failed to create login window")));
    });
  });
}

export async function closeLoginWindow(): Promise<void> {
  if (!isTauri) return;
  await destroyIfPresent(LOGIN_LABEL);
}

export async function focusMainWindow(): Promise<void> {
  if (!isTauri) throw new Error("Not running in Tauri");
  const main = await WebviewWindow.getByLabel(MAIN_LABEL);
  if (!main) throw new Error("main window missing");
  await main.show();
  await main.unminimize();
  await main.setFocus();
}

export async function hideMainWindow(): Promise<void> {
  if (!isTauri) return;
  const main = await WebviewWindow.getByLabel(MAIN_LABEL);
  if (!main) return;
  await main.hide();
}


/**
 * Open (or recreate) an independent image / media viewer window.
 * Pass a gateway-relative path, absolute http(s) URL, or data: URL — not blob:.
 */
export async function openMediaWindow(opts: {
  src: string;
  title?: string;
}): Promise<void> {
  if (!isTauri) throw new Error("Not running in Tauri");
  const src = opts.src?.trim();
  if (!src) throw new Error("src required");
  if (src.startsWith("blob:")) {
    throw new Error("blob: URLs cannot cross webview windows; pass a path or data URL");
  }

  await destroyIfPresent(MEDIA_LABEL);

  const params: Record<string, string> = { window: "media", src };
  if (opts.title?.trim()) params.title = opts.title.trim();

  const win = new WebviewWindow(MEDIA_LABEL, {
    url: buildChildWindowUrl(params),
    title: opts.title?.trim() || "媒体",
    width: 960,
    height: 720,
    minWidth: 480,
    minHeight: 360,
    center: true,
    visible: true,
    resizable: true,
    focus: true,
    ...childDecorations(),
  });

  await new Promise<void>((resolve, reject) => {
    void win.once("tauri://created", () => resolve());
    void win.once("tauri://error", (event) => {
      reject(new Error(String(event.payload ?? "Failed to create media window")));
    });
  });
}
