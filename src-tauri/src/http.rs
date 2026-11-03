//! Persistent reqwest client + Better Auth cookie jar (Electron-partition analogue).
//!
//! Jar file: `{app_data_dir}/cookie-jar.json` (JSON via `cookie_store`).
//! Optional Bearer from `set-auth-token` remains in the OS keyring (frontend).

use std::fs::{self, File};
use std::io::{BufReader, BufWriter};
use std::path::PathBuf;
use std::sync::{Arc, OnceLock, RwLock};

use cookie_store::serde::json as cookie_json;
use cookie_store::{CookieStore as Store, RawCookie};
use reqwest::cookie::CookieStore;
use reqwest::header::HeaderValue;
use reqwest::Url;

struct PersistentJar {
    store: RwLock<Store>,
    path: PathBuf,
}

impl PersistentJar {
    fn load(path: PathBuf) -> Self {
        // load_all: keep session cookies that lack Max-Age (Electron-partition-like).
        let store = if path.exists() {
            match File::open(&path)
                .ok()
                .and_then(|f| cookie_json::load_all(BufReader::new(f)).ok())
            {
                Some(s) => s,
                None => Store::default(),
            }
        } else {
            Store::default()
        };
        Self {
            store: RwLock::new(store),
            path,
        }
    }

    fn persist(&self) {
        let Ok(guard) = self.store.read() else {
            return;
        };
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let tmp = self.path.with_extension("json.tmp");
        let ok = (|| {
            let file = File::create(&tmp)?;
            let mut writer = BufWriter::new(file);
            // Include non-persistent session cookies so Better Auth survives restart.
            cookie_json::save_incl_expired_and_nonpersistent(&guard, &mut writer)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
            writer
                .into_inner()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?
                .sync_all()?;
            fs::rename(&tmp, &self.path)?;
            Ok::<(), std::io::Error>(())
        })();
        if ok.is_err() {
            let _ = fs::remove_file(&tmp);
        }
    }

    fn clear(&self) {
        if let Ok(mut guard) = self.store.write() {
            guard.clear();
        }
        self.persist();
    }
}

impl CookieStore for PersistentJar {
    fn set_cookies(&self, cookie_headers: &mut dyn Iterator<Item = &HeaderValue>, url: &Url) {
        let iter = cookie_headers.filter_map(|val| {
            let s = val.to_str().ok()?;
            RawCookie::parse(s).map(|c| c.into_owned()).ok()
        });
        if let Ok(mut guard) = self.store.write() {
            guard.store_response_cookies(iter, url);
        }
        self.persist();
    }

    fn cookies(&self, url: &Url) -> Option<HeaderValue> {
        let guard = self.store.read().ok()?;
        let s = guard
            .get_request_values(url)
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("; ");
        if s.is_empty() {
            return None;
        }
        HeaderValue::from_str(&s).ok()
    }
}

struct GatewayHttp {
    client: reqwest::Client,
    jar: Arc<PersistentJar>,
}

static GATEWAY_HTTP: OnceLock<GatewayHttp> = OnceLock::new();

/// Call once from Tauri `setup` with `{app_data_dir}/cookie-jar.json`.
pub fn init(jar_path: PathBuf) {
    let _ = GATEWAY_HTTP.get_or_init(|| {
        let jar = Arc::new(PersistentJar::load(jar_path));
        let client = reqwest::Client::builder()
            .cookie_provider(jar.clone())
            .build()
            .expect("reqwest client");
        GatewayHttp { client, jar }
    });
}

fn http() -> &'static GatewayHttp {
    GATEWAY_HTTP
        .get()
        .expect("gateway HTTP not initialized — call http::init in setup")
}

pub fn client() -> &'static reqwest::Client {
    &http().client
}

/// Drop all cookies and rewrite the jar file (sign-out).
pub fn clear_cookies() {
    if let Some(http) = GATEWAY_HTTP.get() {
        http.jar.clear();
    }
}

/// Flush jar to disk (e.g. after subscribe headers may have updated cookies).
pub fn persist_cookies() {
    if let Some(http) = GATEWAY_HTTP.get() {
        http.jar.persist();
    }
}

/// Name/value pairs the jar would send for `url` (Better Auth session bridge).
pub fn cookies_for_url(url: &str) -> Result<Vec<(String, String)>, String> {
    let parsed = Url::parse(url).map_err(|e| e.to_string())?;
    let Some(http) = GATEWAY_HTTP.get() else {
        return Err("gateway HTTP not initialized".into());
    };
    let guard = http
        .jar
        .store
        .read()
        .map_err(|_| "cookie jar lock poisoned".to_string())?;
    let pairs = guard
        .get_request_values(&parsed)
        .map(|(name, value)| (name.to_string(), value.to_string()))
        .collect();
    Ok(pairs)
}
