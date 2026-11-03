import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/platform";
import { usePrefs } from "@/stores/prefs";
import { useUi } from "@/stores/ui";

/**
 * System interactive screenshot (macOS). Honors「截图前隐藏主窗」pref.
 * Result is copied to clipboard by screencapture; file path returned when saved.
 */
export async function takeSystemScreenshot(): Promise<string | null> {
  const toast = (msg: string) => useUi.getState().showToast(msg);
  if (!isTauri) {
    toast("系统截图仅桌面客户端可用");
    return null;
  }
  const hideWindow = usePrefs.getState().screenshotHideWindow;
  try {
    const path = await invoke<string>("capture_screenshot", { hideWindow });
    if (path) {
      toast("截图已复制到剪贴板，并已保存");
    } else {
      toast("截图已复制到剪贴板");
    }
    return path || null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/取消|cancel/i.test(msg)) {
      toast(msg || "截图失败");
    }
    return null;
  }
}
