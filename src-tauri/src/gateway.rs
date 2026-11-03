//! HTTP proxy, SSE subscribe, optional legacy WS, secrets, tray badge.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue, Message};

use crate::http;

pub static ALLOW_EXIT: AtomicBool = AtomicBool::new(false);
pub static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

static SOCKET_GEN: AtomicU64 = AtomicU64::new(0);
/// Bumped to cancel an in-flight `threads.subscribe` SSE stream.
static SUB_GEN: AtomicU64 = AtomicU64::new(0);

const KEYRING_SERVICE: &str = "com.pica.desktop";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyRequest {
    pub base_url: String,
    pub token: String,
    pub method: String,
    pub path: String,
    pub body: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyResponse {
    pub status: u16,
    pub content_type: String,
    pub body_base64: String,
    pub headers: std::collections::HashMap<String, String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SocketStatus {
    state: &'static str,
    detail: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SubscribeStatus {
    state: &'static str,
    detail: String,
}

fn origin_of(base: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(base).map_err(|err| err.to_string())?;
    let host = url
        .host_str()
        .ok_or_else(|| "server URL has no host".to_string())?;
    let port = url.port().map(|port| format!(":{port}")).unwrap_or_default();
    Ok(format!("{}://{host}{port}", url.scheme()))
}

fn join_url(base: &str, path: &str) -> Result<String, String> {
    if !path.starts_with('/') {
        return Err("path must start with /".into());
    }
    let origin = origin_of(base)?;
    Ok(format!("{}{path}", origin.trim_end_matches('/')))
}

fn b64_encode(bytes: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    let mut i = 0;
    while i + 3 <= bytes.len() {
        let n = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8) | (bytes[i + 2] as u32);
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(T[((n >> 6) & 63) as usize] as char);
        out.push(T[(n & 63) as usize] as char);
        i += 3;
    }
    if i < bytes.len() {
        let rem = bytes.len() - i;
        let mut n = (bytes[i] as u32) << 16;
        if rem == 2 {
            n |= (bytes[i + 1] as u32) << 8;
        }
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        if rem == 2 {
            out.push(T[((n >> 6) & 63) as usize] as char);
            out.push('=');
        } else {
            out.push('=');
            out.push('=');
        }
    }
    out
}

#[tauri::command]
pub async fn gateway_request(req: ProxyRequest) -> Result<ProxyResponse, String> {
    let url = join_url(&req.base_url, &req.path)?;
    let method = req.method.to_uppercase();
    let client = http::client();
    let mut builder = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "PATCH" => client.patch(&url),
        "DELETE" => client.delete(&url),
        "HEAD" => client.head(&url),
        other => return Err(format!("unsupported method {other}")),
    };
    let origin = origin_of(&req.base_url)?;
    builder = builder.header("Origin", &origin);
    let token = req.token.trim();
    if !token.is_empty() {
        builder = builder.header("Authorization", format!("Bearer {token}"));
    }
    if let Some(body) = &req.body {
        builder = builder
            .header("Content-Type", "application/json")
            .body(body.clone());
    }
    let response = builder.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let mut headers = std::collections::HashMap::new();
    for (name, value) in response.headers().iter() {
        if let Ok(v) = value.to_str() {
            headers.insert(name.as_str().to_ascii_lowercase(), v.to_string());
        }
    }
    let content_type = headers
        .get("content-type")
        .cloned()
        .unwrap_or_else(|| "application/octet-stream".into());
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    http::persist_cookies();
    Ok(ProxyResponse {
        status,
        content_type,
        body_base64: b64_encode(&bytes),
        headers,
    })
}

/// Legacy WS bus (kept for invoke parity). Prefer SSE `gateway_subscribe`.
#[tauri::command]
pub fn gateway_connect(app: AppHandle, base_url: String, token: String) {
    let generation = SOCKET_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        loop {
            if SOCKET_GEN.load(Ordering::SeqCst) != generation {
                break;
            }
            match run_gateway_socket(&app, &base_url, &token, generation).await {
                Ok(()) => break,
                Err(detail) => {
                    let _ = app.emit(
                        "gateway-status",
                        SocketStatus {
                            state: "reconnecting",
                            detail,
                        },
                    );
                    tokio::time::sleep(Duration::from_millis(2000)).await;
                }
            }
        }
    });
}

#[tauri::command]
pub fn gateway_disconnect() {
    SOCKET_GEN.fetch_add(1, Ordering::SeqCst);
}

async fn run_gateway_socket(
    app: &AppHandle,
    base: &str,
    token: &str,
    generation: u64,
) -> Result<(), String> {
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
    let ws_url = format!("{scheme}://{rest}/ws");
    let mut request = ws_url
        .into_client_request()
        .map_err(|err| err.to_string())?;
    let headers = request.headers_mut();
    headers.insert(
        "Origin",
        HeaderValue::from_str(&origin).map_err(|err| err.to_string())?,
    );
    let token = token.trim();
    if !token.is_empty() {
        headers.insert(
            "Authorization",
            HeaderValue::from_str(&format!("Bearer {token}")).map_err(|err| err.to_string())?,
        );
    }
    let (mut socket, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|err| err.to_string())?;
    let _ = app.emit(
        "gateway-status",
        SocketStatus {
            state: "live",
            detail: String::new(),
        },
    );
    while SOCKET_GEN.load(Ordering::SeqCst) == generation {
        match socket.next().await {
            Some(Ok(Message::Text(text))) => {
                let _ = app.emit("gateway-event", text.to_string());
            }
            Some(Ok(Message::Ping(p))) => {
                let _ = socket.send(Message::Pong(p)).await;
            }
            Some(Ok(Message::Close(_))) | None => {
                let _ = app.emit(
                    "gateway-status",
                    SocketStatus {
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
    let _ = socket.close(None).await;
    Ok(())
}

#[tauri::command]
pub fn gateway_subscribe(app: AppHandle, base_url: String, token: String, path: String, body: String) {
    let generation = SUB_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        let _ = app.emit(
            "rpc-subscribe-status",
            SubscribeStatus {
                state: "connecting",
                detail: String::new(),
            },
        );
        match run_subscribe(&app, &base_url, &token, &path, &body, generation).await {
            Ok(()) => {
                let _ = app.emit(
                    "rpc-subscribe-status",
                    SubscribeStatus {
                        state: "closed",
                        detail: String::new(),
                    },
                );
            }
            Err(detail) => {
                let _ = app.emit(
                    "rpc-subscribe-status",
                    SubscribeStatus {
                        state: "error",
                        detail,
                    },
                );
            }
        }
    });
}

#[tauri::command]
pub fn gateway_unsubscribe() {
    SUB_GEN.fetch_add(1, Ordering::SeqCst);
}

async fn run_subscribe(
    app: &AppHandle,
    base: &str,
    token: &str,
    path: &str,
    body: &str,
    generation: u64,
) -> Result<(), String> {
    let url = join_url(base, path)?;
    let origin = origin_of(base)?;
    let client = http::client();
    let mut builder = client
        .post(&url)
        .header("Accept", "text/event-stream")
        .header("Content-Type", "application/json")
        .header("Origin", &origin)
        .body(body.to_string());
    let token = token.trim();
    if !token.is_empty() {
        builder = builder.header("Authorization", format!("Bearer {token}"));
    }
    let response = builder.send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("subscribe HTTP {}", response.status()));
    }
    let _ = app.emit(
        "rpc-subscribe-status",
        SubscribeStatus {
            state: "live",
            detail: String::new(),
        },
    );
    use futures_util::StreamExt as _;
    let mut stream = response.bytes_stream();
    let mut buf = String::new();
    while SUB_GEN.load(Ordering::SeqCst) == generation {
        let next = tokio::time::timeout(Duration::from_secs(120), stream.next()).await;
        let chunk = match next {
            Ok(Some(Ok(bytes))) => bytes,
            Ok(Some(Err(err))) => return Err(err.to_string()),
            Ok(None) => break,
            Err(_) => continue, // idle timeout — keep waiting
        };
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buf.find("\n\n") {
            let frame = buf[..pos].to_string();
            buf = buf[pos + 2..].to_string();
            let mut data_lines: Vec<String> = Vec::new();
            let mut event_name = String::new();
            for line in frame.lines() {
                if let Some(rest) = line.strip_prefix("data:") {
                    data_lines.push(rest.trim_start().to_string());
                } else if let Some(rest) = line.strip_prefix("event:") {
                    event_name = rest.trim().to_string();
                }
            }
            if event_name == "error" {
                let msg = data_lines.join("\n");
                return Err(format!("subscribe error event: {msg}"));
            }
            if data_lines.is_empty() {
                continue;
            }
            let payload = data_lines.join("\n");
            // Peel oRPC / SSE JSON if wrapped as {"json": ...}
            let peeled = match serde_json::from_str::<serde_json::Value>(&payload) {
                Ok(v) => {
                    if let Some(inner) = v.get("json") {
                        inner.to_string()
                    } else {
                        payload
                    }
                }
                Err(_) => payload,
            };
            let _ = app.emit("rpc-subscribe-event", peeled);
        }
        http::persist_cookies();
    }
    Ok(())
}

#[tauri::command]
pub fn gateway_clear_cookies() {
    http::clear_cookies();
}

/// Copy jar cookies for `url`'s origin into the named webview (screen iframe auth).
#[tauri::command]
pub fn gateway_inject_session_cookies(
    app: AppHandle,
    window_label: String,
    url: String,
) -> Result<u32, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "screen url missing host".to_string())?
        .to_string();
    let pairs = http::cookies_for_url(&url)?;
    let window: WebviewWindow = app
        .get_webview_window(&window_label)
        .ok_or_else(|| format!("webview `{window_label}` not found"))?;
    let mut count = 0u32;
    for (name, value) in pairs {
        let mut cookie = cookie::Cookie::new(name, value);
        cookie.set_domain(host.clone());
        cookie.set_path("/");
        if parsed.scheme() == "https" {
            cookie.set_secure(true);
        }
        window
            .set_cookie(cookie)
            .map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

#[tauri::command]
pub fn secret_get(account: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_set(account: String, secret: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &account).map_err(|e| e.to_string())?;
    entry.set_password(&secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_delete(account: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &account).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn set_tray_attention(app: AppHandle, count: u32) {
    #[cfg(desktop)]
    {
        if let Some(tray) = app.tray_by_id("main") {
            let title = if count == 0 {
                String::new()
            } else if count > 99 {
                "99+".into()
            } else {
                count.to_string()
            };
            let _ = tray.set_title(Some(title));
        }
        // macOS Dock badge (and supported platforms) — clear when unread is 0.
        if let Some(window) = app.get_webview_window("main") {
            let badge = if count == 0 {
                None
            } else {
                Some(i64::from(count.min(99)))
            };
            let _ = window.set_badge_count(badge);
        }
    }
    let _ = (app, count);
}

#[tauri::command]
pub fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::SeqCst);
}

#[tauri::command]
pub fn get_close_to_tray() -> bool {
    CLOSE_TO_TRAY.load(Ordering::SeqCst)
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
