/**
 * Platform helpers for desktop chrome (titlebar insets, ActionBar).
 * HuLa-inspired: "compatibility" = Windows/Linux custom chrome path.
 */

const w = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : null;
const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const platform = typeof navigator !== "undefined" ? navigator.platform : "";

/** Running inside a Tauri webview */
export const isTauri =
  !!w && ("__TAURI_INTERNALS__" in w || "__TAURI__" in w || "__TAURI_OS_PLUGIN_INTERNALS__" in w);

export const isMac =
  /Mac|iPhone|iPod|iPad/i.test(platform) || /Mac OS X/i.test(ua);

export const isWindows = /Win/i.test(platform) || /Windows/i.test(ua);

export const isLinux = /Linux/i.test(platform) && !/Android/i.test(ua);

/** Windows + Linux — custom ActionBar / undecorated window (HuLa compatibility mode). */
export const isCompatibility = isWindows || isLinux;
