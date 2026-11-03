import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMac, isTauri } from "@/lib/platform";

/**
 * HuLa-inspired window controls for the main webview.
 * Used by ActionBar on Windows/Linux; macOS keeps native traffic lights.
 */
export function useWindow() {
  const [maximized, setMaximized] = useState(false);

  const refreshMaximized = useCallback(async () => {
    if (!isTauri) return;
    try {
      const win = getCurrentWindow();
      const isMax = await win.isMaximized();
      if (isMac) {
        const fullscreen = await win.isFullscreen();
        setMaximized(isMax || fullscreen);
      } else {
        setMaximized(isMax);
      }
    } catch {
      /* web preview */
    }
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    void refreshMaximized();
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win.onResized(() => {
      void refreshMaximized();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [refreshMaximized]);

  const minimize = useCallback(async () => {
    if (!isTauri) return;
    await getCurrentWindow().minimize();
  }, []);

  const toggleMaximize = useCallback(async () => {
    if (!isTauri) return;
    await getCurrentWindow().toggleMaximize();
    await refreshMaximized();
  }, [refreshMaximized]);

  const close = useCallback(async () => {
    if (!isTauri) return;
    await getCurrentWindow().close();
  }, []);

  return {
    maximized,
    minimize,
    toggleMaximize,
    close,
    refreshMaximized,
  };
}
