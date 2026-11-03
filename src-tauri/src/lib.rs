mod device;
mod gateway;
mod http;
mod shell;

use std::sync::atomic::Ordering;

use tauri::Manager;

use gateway::{show_main, ALLOW_EXIT, CLOSE_TO_TRAY};

#[cfg(desktop)]
fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show_i = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

    let icon = app
        .default_window_icon()
        .expect("app icon missing — check src-tauri/icons")
        .clone();

    let _tray = TrayIconBuilder::with_id("main")
        .tooltip("Pica")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => {
                ALLOW_EXIT.store(true, Ordering::SeqCst);
                crate::device::disconnect();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::WindowEvent;
    use tauri_plugin_decorum::WebviewWindowExt;

    // HuLa-inspired platform split (logic only — Pica keeps its own UI tokens):
    // - macOS: Overlay + hiddenTitle + decorum traffic lights
    // - Windows/Linux: undecorated + frontend ActionBar (no decorum-injected buttons)
    // Startup: visible:false in tauri.conf; restore size/pos; frontend shows after session gate.
    // window-state omits DECORATIONS so a prior decorated session cannot undo Win chrome.
    // Desktop extras: single-instance (focus existing), tray + close-to-tray.
    #[cfg(desktop)]
    let window_state_plugin = {
        use tauri_plugin_window_state::{Builder as WindowStateBuilder, StateFlags};
        WindowStateBuilder::new()
            .with_state_flags(
                StateFlags::SIZE
                    | StateFlags::POSITION
                    | StateFlags::MAXIMIZED
                    | StateFlags::FULLSCREEN,
            )
            .build()
    };

    // Single-instance must register first so a second launch exits before other plugins run.
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }));
    }

    builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_decorum::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(window_state_plugin);
        builder = builder
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--autostart"]),
            ))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_clipboard_manager::init());
    }

    #[cfg(desktop)]
    {
        // Close (traffic light / ActionBar / Cmd+W) hides to tray instead of quitting
        // when close-to-tray is on. Real exit: tray 「退出」 or Cmd+Q.
        // Close-to-tray applies only to `main`. settings/screen destroy normally.
        // HuLa-like: closing `login` while main is not visible exits the app.
        builder = builder.on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label().to_string();
                if label == "main" && !ALLOW_EXIT.load(Ordering::SeqCst) {
                    if CLOSE_TO_TRAY.load(Ordering::SeqCst) {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        ALLOW_EXIT.store(true, Ordering::SeqCst);
                        api.prevent_close();
                        window.app_handle().exit(0);
                    }
                    return;
                }
                if label == "login" {
                    let main_visible = window
                        .app_handle()
                        .get_webview_window("main")
                        .and_then(|m| m.is_visible().ok())
                        .unwrap_or(false);
                    if !main_visible && !ALLOW_EXIT.load(Ordering::SeqCst) {
                        ALLOW_EXIT.store(true, Ordering::SeqCst);
                        window.app_handle().exit(0);
                    }
                }
            }
        });
    }

    let app = builder
        .setup(|app| {
            // Persistent Better Auth cookie jar (Electron persist: partition analogue).
            {
                let dir = app
                    .path()
                    .app_data_dir()
                    .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;
                std::fs::create_dir_all(&dir)?;
                http::init(dir.join("cookie-jar.json"));
            }

            #[cfg(desktop)]
            setup_tray(app)?;

            let Some(main_window) = app.get_webview_window("main") else {
                return Ok(());
            };

            #[cfg(target_os = "macos")]
            {
                // Overlay titlebar + native traffic lights (decorum).
                main_window.create_overlay_titlebar()?;
                // ~42px custom titlebar: x inset clears the left edge;
                // y grows the native traffic-light container so the cluster
                // sits visually centered in the HTML chrome.
                main_window.set_traffic_lights_inset(18.0, 20.0)?;
                let _ = main_window.make_transparent();
            }

            #[cfg(not(target_os = "macos"))]
            {
                // Compatibility path (HuLa): skip decorum control injection.
                // Frontend ActionBar owns min/max/close + drag region.
                let _ = main_window.set_decorations(false);
                let _ = main_window.set_shadow(true);
            }

            // Anti-flash + login→home: conf starts invisible; apply chrome while hidden.
            // Do NOT show() here — frontend session probe owns visibility.
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            gateway::gateway_request,
            gateway::gateway_connect,
            gateway::gateway_disconnect,
            gateway::gateway_subscribe,
            gateway::gateway_unsubscribe,
            gateway::set_tray_attention,
            gateway::set_close_to_tray,
            gateway::get_close_to_tray,
            gateway::secret_get,
            gateway::secret_set,
            gateway::secret_delete,
            gateway::gateway_clear_cookies,
            gateway::gateway_inject_session_cookies,
            device::device_connect,
            device::device_disconnect,
            device::device_set_allowed,
            device::device_get_allowed,
            shell::toggle_main_window,
            shell::capture_screenshot
        ])
        .build(tauri::generate_context!())
        .expect("error while building Pica");

    app.run(|app_handle, event| {
        // After close-to-tray, macOS dock click does not restore a hidden window by itself.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } = event
        {
            if !has_visible_windows {
                show_main(app_handle);
            }
        }
        let _ = (app_handle, event);
    });
}
