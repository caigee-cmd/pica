//! Outbound WebSocket client for `{origin}/api/devices/connect`.
//! Advances past pure deny-all toward Electron `startUserDeviceClient`:
//! - cancel / revoked handling
//! - ping keepalive
//! - consent gate (`device_set_allowed`)
//! - `environment` answered with real host facts
//! - host runner: execute / listFiles / readFile / writeFile (+ soft lifecycle)
//! - unknown methods still refused with structured frames

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue, Message};

static DEVICE_GEN: AtomicU64 = AtomicU64::new(0);
/// Electron-style consent: when false, every request gets "Not allowed on this computer".
static DEVICE_ALLOWED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStatus {
    pub state: &'static str,
    pub detail: String,
}

pub fn disconnect() {
    DEVICE_GEN.fetch_add(1, Ordering::SeqCst);
}

#[tauri::command]
pub fn device_set_allowed(allowed: bool) {
    DEVICE_ALLOWED.store(allowed, Ordering::SeqCst);
}

#[tauri::command]
pub fn device_get_allowed() -> bool {
    DEVICE_ALLOWED.load(Ordering::SeqCst)
}

/// WebSocket `{origin}/api/devices/connect` with device Bearer token.
#[tauri::command]
pub fn device_connect(app: AppHandle, base_url: String, token: String) {
    let generation = DEVICE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        loop {
            if DEVICE_GEN.load(Ordering::SeqCst) != generation {
                break;
            }
            match run_device_socket(&app, &base_url, &token, generation).await {
                Ok(()) => break,
                Err(detail) => {
                    let _ = app.emit(
                        "device-status",
                        DeviceStatus {
                            state: "reconnecting",
                            detail: detail.clone(),
                        },
                    );
                    tokio::time::sleep(Duration::from_millis(2000)).await;
                }
            }
        }
    });
}

#[tauri::command]
pub fn device_disconnect() {
    disconnect();
}

fn origin_of(base: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(base).map_err(|err| err.to_string())?;
    let host = url
        .host_str()
        .ok_or_else(|| "server URL has no host".to_string())?;
    let port = url.port().map(|port| format!(":{port}")).unwrap_or_default();
    Ok(format!("{}://{host}{port}", url.scheme()))
}

fn host_environment() -> serde_json::Value {
    let platform = if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "windows") {
        "win32"
    } else {
        "linux"
    };
    let home = dirs_home();
    let shell = if cfg!(target_os = "windows") {
        "powershell.exe".to_string()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into())
    };
    serde_json::json!({
        "platform": platform,
        "home": home,
        "shell": shell,
    })
}

fn dirs_home() -> String {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| "C:\\".into())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").unwrap_or_else(|_| "/".into())
    }
}

async fn send_frame(
    socket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    id: &str,
    frame: serde_json::Value,
) -> Result<(), String> {
    let reply = serde_json::json!({ "type": "frame", "id": id, "frame": frame });
    socket
        .send(Message::Text(reply.to_string().into()))
        .await
        .map_err(|e| e.to_string())
}

fn request_params(request: &serde_json::Value) -> &serde_json::Value {
    request
        .get("params")
        .or_else(|| request.get("arguments"))
        .unwrap_or(request)
}

fn param_str(params: &serde_json::Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(v) = params.get(*key).and_then(|x| x.as_str()) {
            return Some(v.to_string());
        }
    }
    None
}

fn resolve_host_path(raw: &str) -> Result<std::path::PathBuf, String> {
    let home = dirs_home();
    let path = if raw.is_empty() || raw == "~" {
        std::path::PathBuf::from(&home)
    } else if let Some(rest) = raw.strip_prefix("~/") {
        std::path::PathBuf::from(&home).join(rest)
    } else if raw.starts_with('/') || (cfg!(target_os = "windows") && raw.chars().nth(1) == Some(':'))
    {
        std::path::PathBuf::from(raw)
    } else {
        std::path::PathBuf::from(&home).join(raw)
    };
    Ok(path)
}

async fn host_list_files(path: &str) -> Result<serde_json::Value, String> {
    let dir = resolve_host_path(path)?;
    let mut entries = Vec::new();
    let mut rd = tokio::fs::read_dir(&dir)
        .await
        .map_err(|e| format!("listFiles: {}: {e}", dir.display()))?;
    while let Some(ent) = rd
        .next_entry()
        .await
        .map_err(|e| format!("listFiles read: {e}"))?
    {
        let meta = ent.metadata().await.map_err(|e| e.to_string())?;
        let name = ent.file_name().to_string_lossy().to_string();
        let full = ent.path().to_string_lossy().to_string();
        entries.push(serde_json::json!({
            "name": name,
            "path": full,
            "kind": if meta.is_dir() { "dir" } else { "file" },
            "size": meta.len(),
        }));
        if entries.len() >= 500 {
            break;
        }
    }
    Ok(serde_json::Value::Array(entries))
}

async fn host_read_file(path: &str) -> Result<serde_json::Value, String> {
    let file = resolve_host_path(path)?;
    let meta = tokio::fs::metadata(&file)
        .await
        .map_err(|e| format!("readFile: {}: {e}", file.display()))?;
    if meta.len() > 1_048_576 {
        return Err(format!(
            "readFile: file too large ({} bytes; max 1MiB text)",
            meta.len()
        ));
    }
    let bytes = tokio::fs::read(&file)
        .await
        .map_err(|e| format!("readFile: {e}"))?;
    let content = String::from_utf8_lossy(&bytes).to_string();
    Ok(serde_json::json!({
        "path": file.to_string_lossy(),
        "content": content,
    }))
}

async fn host_write_file(path: &str, content: &str) -> Result<serde_json::Value, String> {
    let file = resolve_host_path(path)?;
    if let Some(parent) = file.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("writeFile mkdir: {e}"))?;
    }
    tokio::fs::write(&file, content.as_bytes())
        .await
        .map_err(|e| format!("writeFile: {e}"))?;
    Ok(serde_json::json!({
        "path": file.to_string_lossy(),
        "ok": true,
    }))
}

async fn host_execute(params: &serde_json::Value) -> Result<serde_json::Value, String> {
    let command = param_str(params, &["command", "cmd", "shell"])
        .ok_or_else(|| "execute requires command".to_string())?;
    let cwd = param_str(params, &["cwd", "workdir", "workingDirectory"]);
    let timeout_ms = params
        .get("timeoutMs")
        .or_else(|| params.get("timeout"))
        .and_then(|v| v.as_u64())
        .unwrap_or(30_000)
        .min(120_000);

    let args: Vec<String> = params
        .get("args")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let mut cmd = if args.is_empty() {
        #[cfg(target_os = "windows")]
        {
            let mut c = tokio::process::Command::new("powershell.exe");
            c.arg("-NoProfile").arg("-Command").arg(&command);
            c
        }
        #[cfg(not(target_os = "windows"))]
        {
            let mut c = tokio::process::Command::new("sh");
            c.arg("-lc").arg(&command);
            c
        }
    } else {
        let mut c = tokio::process::Command::new(&command);
        c.args(&args);
        c
    };
    if let Some(dir) = cwd.as_deref() {
        let path = resolve_host_path(dir)?;
        cmd.current_dir(path);
    }
    cmd.stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let child = cmd.spawn().map_err(|e| format!("execute spawn: {e}"))?;
    let wait = tokio::time::timeout(Duration::from_millis(timeout_ms), child.wait_with_output());
    let output = match wait.await {
        Ok(Ok(out)) => out,
        Ok(Err(e)) => return Err(format!("execute: {e}")),
        Err(_) => {
            return Err(format!("execute timed out after {timeout_ms}ms"));
        }
    };
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let trunc = |s: String| {
        if s.len() > 200_000 {
            format!("{}…[truncated {} bytes]", &s[..200_000], s.len())
        } else {
            s
        }
    };
    Ok(serde_json::json!({
        "exitCode": output.status.code(),
        "stdout": trunc(stdout),
        "stderr": trunc(stderr),
    }))
}

async fn handle_request(
    socket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    app: &AppHandle,
    id: &str,
    request: &serde_json::Value,
) -> Result<(), String> {
    if !DEVICE_ALLOWED.load(Ordering::SeqCst) {
        return send_frame(
            socket,
            id,
            serde_json::json!({ "error": "Not allowed on this computer" }),
        )
        .await;
    }

    let method = request
        .get("method")
        .and_then(|m| m.as_str())
        .unwrap_or("");
    let params = request_params(request);
    let _ = app.emit(
        "device-status",
        DeviceStatus {
            state: "live",
            detail: if method.is_empty() {
                String::new()
            } else {
                format!("request:{method}")
            },
        },
    );

    let result = match method {
        "environment" => Ok(serde_json::json!({ "value": host_environment() })),
        "isRunning" => Ok(serde_json::json!({ "value": false })),
        "stop" | "destroy" | "cancelRunWork" => Ok(serde_json::json!({ "value": null })),
        "listFiles" | "readdir" | "ls" => {
            let path = param_str(params, &["path", "dir", "directory"]).unwrap_or_else(|| ".".into());
            host_list_files(&path)
                .await
                .map(|value| serde_json::json!({ "value": value }))
        }
        "readFile" | "read" => {
            let path = param_str(params, &["path", "file"])
                .ok_or_else(|| "readFile requires path".to_string())?;
            host_read_file(&path)
                .await
                .map(|value| serde_json::json!({ "value": value }))
        }
        "writeFile" | "write" => {
            let path = param_str(params, &["path", "file"])
                .ok_or_else(|| "writeFile requires path".to_string())?;
            let content = param_str(params, &["content", "data", "text"])
                .ok_or_else(|| "writeFile requires content".to_string())?;
            host_write_file(&path, &content)
                .await
                .map(|value| serde_json::json!({ "value": value }))
        }
        "execute" | "run" | "shell" => host_execute(params)
            .await
            .map(|value| serde_json::json!({ "value": value })),
        "" => Err("Local computer request is invalid".into()),
        other => Err(format!(
            "Pica host computer runner does not support `{other}` yet (environment / execute / listFiles / readFile / writeFile / soft lifecycle)"
        )),
    };

    match result {
        Ok(frame) => {
            send_frame(socket, id, frame).await?;
            send_frame(socket, id, serde_json::json!({ "done": true })).await
        }
        Err(error) => send_frame(socket, id, serde_json::json!({ "error": error })).await,
    }
}

async fn run_device_socket(
    app: &AppHandle,
    base: &str,
    token: &str,
    generation: u64,
) -> Result<(), String> {
    let ws_url = {
        let origin = origin_of(base)?;
        let trimmed = origin.trim_end_matches('/');
        let scheme = if trimmed.starts_with("https") {
            "wss"
        } else {
            "ws"
        };
        let rest = trimmed
            .strip_prefix("https://")
            .or_else(|| trimmed.strip_prefix("http://"))
            .unwrap_or(trimmed);
        format!("{scheme}://{rest}/api/devices/connect")
    };
    let mut request = ws_url
        .into_client_request()
        .map_err(|err| err.to_string())?;
    let origin = origin_of(base)?;
    let headers = request.headers_mut();
    let token = token.trim();
    if token.is_empty() {
        return Err("device token empty".into());
    }
    headers.insert(
        "Authorization",
        HeaderValue::from_str(&format!("Bearer {token}")).map_err(|err| err.to_string())?,
    );
    headers.insert(
        "Origin",
        HeaderValue::from_str(&origin).map_err(|err| err.to_string())?,
    );
    let (mut socket, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|err| err.to_string())?;
    let _ = app.emit(
        "device-status",
        DeviceStatus {
            state: "live",
            detail: String::new(),
        },
    );

    // Track in-flight request ids so cancel can drop them (we abort by ignoring further frames).
    let mut cancelled_ids: HashMap<String, bool> = HashMap::new();
    let mut last_ping = std::time::Instant::now();

    loop {
        if DEVICE_GEN.load(Ordering::SeqCst) != generation {
            let _ = socket.close(None).await;
            let _ = app.emit(
                "device-status",
                DeviceStatus {
                    state: "closed",
                    detail: String::new(),
                },
            );
            return Ok(());
        }
        if last_ping.elapsed() >= Duration::from_secs(30) {
            if socket.send(Message::Ping(Vec::new().into())).await.is_err() {
                return Err("device ping failed".into());
            }
            last_ping = std::time::Instant::now();
        }
        let msg = match tokio::time::timeout(Duration::from_secs(5), socket.next()).await {
            Ok(m) => m,
            Err(_) => continue,
        };
        match msg {
            Some(Ok(Message::Text(text))) => {
                let text = text.to_string();
                let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else {
                    continue;
                };
                let ty = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match ty {
                    "revoked" => {
                        let _ = app.emit(
                            "device-status",
                            DeviceStatus {
                                state: "revoked",
                                detail: "server revoked device".into(),
                            },
                        );
                        DEVICE_GEN.fetch_add(1, Ordering::SeqCst);
                        let _ = socket.close(None).await;
                        return Ok(());
                    }
                    "cancel" => {
                        if let Some(id) = v.get("id").and_then(|x| x.as_str()) {
                            cancelled_ids.insert(id.to_string(), true);
                        }
                    }
                    "request" => {
                        let id = v
                            .get("id")
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string();
                        if id.is_empty() {
                            continue;
                        }
                        if cancelled_ids.remove(&id).unwrap_or(false) {
                            continue;
                        }
                        let req = v.get("request").cloned().unwrap_or(serde_json::json!({}));
                        let _ = handle_request(&mut socket, app, &id, &req).await;
                    }
                    _ => {}
                }
            }
            Some(Ok(Message::Ping(p))) => {
                let _ = socket.send(Message::Pong(p)).await;
            }
            Some(Ok(Message::Pong(_))) => {}
            Some(Ok(Message::Close(_))) | None => {
                let _ = app.emit(
                    "device-status",
                    DeviceStatus {
                        state: "closed",
                        detail: "socket closed".into(),
                    },
                );
                return Ok(());
            }
            Some(Ok(_)) => {}
            Some(Err(err)) => return Err(err.to_string()),
        }
    }
}
