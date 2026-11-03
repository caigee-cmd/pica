import { isTauri } from "@/lib/platform";
import { usePrefs } from "@/stores/prefs";
import { takeSystemScreenshot } from "@/lib/screenshot";

let bound = false;

async function toggleMain(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("toggle_main_window");
}

/**
 * Register or clear global shortcuts from prefs.
 * Default: disabled until user enables in Settings（对齐 HuLa：需显式开启）.
 */
export async function syncGlobalShortcuts(): Promise<void> {
  if (!isTauri) return;
  try {
    const { register, unregisterAll } = await import("@tauri-apps/plugin-global-shortcut");
    await unregisterAll();
    bound = false;
    const prefs = usePrefs.getState();
    if (!prefs.globalShortcutEnabled) return;

    const toggleAccel = prefs.globalShortcutToggle.trim() || "CommandOrControl+Shift+P";
    await register(toggleAccel, async (event) => {
      if (event.state !== "Pressed") return;
      try {
        await toggleMain();
      } catch {
        /* ignore */
      }
    });

    if (prefs.globalShortcutScreenshotEnabled) {
      const shotAccel = prefs.globalShortcutScreenshot.trim() || "CommandOrControl+Shift+A";
      await register(shotAccel, async (event) => {
        if (event.state !== "Pressed") return;
        await takeSystemScreenshot();
      });
    }
    bound = true;
  } catch (err) {
    console.warn("[pica] global shortcut sync failed", err);
  }
}

export async function clearGlobalShortcuts(): Promise<void> {
  if (!isTauri || !bound) return;
  try {
    const { unregisterAll } = await import("@tauri-apps/plugin-global-shortcut");
    await unregisterAll();
  } catch {
    /* ignore */
  }
  bound = false;
}
