//! Desktop shell helpers: interactive screenshot + main window toggle.
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

/// Toggle main window visibility (global shortcut: show/hide).
#[tauri::command]
pub fn toggle_main_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

/// Interactive system screenshot (macOS `screencapture -i`).
/// Optionally hide the main window first (HuLa-style), then restore.
/// Writes PNG under app cache and also copies to the clipboard (`-c`).
#[tauri::command]
pub async fn capture_screenshot(app: AppHandle, hide_window: bool) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let main = app.get_webview_window("main");
        let was_visible = main
            .as_ref()
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(false);

        if hide_window {
            if let Some(ref w) = main {
                let _ = w.hide();
            }
            tokio::time::sleep(std::time::Duration::from_millis(220)).await;
        }

        let dir = app
            .path()
            .app_cache_dir()
            .map_err(|e| e.to_string())?
            .join("screenshots");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let path = dir.join(format!("pica-{ts}.png"));
        let path_str = path.to_string_lossy().to_string();

        let status = tokio::process::Command::new("screencapture")
            .args(["-i", "-x", "-c", &path_str])
            .status()
            .await
            .map_err(|e| format!("screencapture: {e}"))?;

        if hide_window && was_visible {
            if let Some(ref w) = main {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }

        if !status.success() {
            return Err("截图已取消或失败".into());
        }
        if !path.exists() {
            // Clipboard-only success is still OK — return a sentinel path.
            return Ok(String::new());
        }
        Ok(path_str)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, hide_window);
        Err("当前平台尚未实现系统截图（仅 macOS）".into())
    }
}
