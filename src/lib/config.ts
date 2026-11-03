import type { GatewayConfig } from "@/types/gateway";
import { isTauri } from "@/lib/platform";
import {
  GATEWAY_TOKEN_ACCOUNT,
  secretDelete,
  secretGet,
  secretSet,
} from "@/lib/secrets";

const KEY = "pica.gateway";

/** Suggested public Existing-instance origin (not auto-written). */
export const DEFAULT_ORIGIN_HINT = "https://rakazo.caiaiu.com";

/** Local web preview for this deploy (RAKAZO_WEB_PORT). Never use :3100 as origin. */
export const LOCAL_ORIGIN_HINT = "http://127.0.0.1:45173";

const EMPTY: GatewayConfig = { baseUrl: "", token: "" };

type StoredGateway = {
  baseUrl?: string;
  /** Legacy / optional plaintext session token — migrated to keyring on Tauri. */
  token?: string;
};

/** Sync snapshot: origin from localStorage; token empty until `hydrateSecrets`. */
export function loadConfig(): GatewayConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as StoredGateway;
    const baseUrl = normalizeBaseUrl(parsed.baseUrl ?? "");
    const token = isTauri ? "" : (parsed.token ?? "").trim();
    return { baseUrl, token };
  } catch {
    return { ...EMPTY };
  }
}

function writeLocal(baseUrl: string, tokenForBrowser?: string): void {
  const payload: StoredGateway = { baseUrl };
  if (!isTauri && tokenForBrowser) {
    payload.token = tokenForBrowser;
  }
  localStorage.setItem(KEY, JSON.stringify(payload));
}

/** Persist origin (localStorage) + optional session token (keyring on Tauri). */
export async function saveConfig(config: GatewayConfig): Promise<GatewayConfig> {
  const next: GatewayConfig = {
    baseUrl: normalizeBaseUrl(config.baseUrl),
    token: (config.token ?? "").trim(),
  };
  if (isForbiddenApiPort(next.baseUrl)) {
    throw new Error(
      "Do not use API port :3100 as the server address. Use the web origin (e.g. https://rakazo.caiaiu.com or http://127.0.0.1:45173).",
    );
  }
  if (isTauri) {
    writeLocal(next.baseUrl);
    if (next.token) await secretSet(GATEWAY_TOKEN_ACCOUNT, next.token);
    else await secretDelete(GATEWAY_TOKEN_ACCOUNT);
    scrubLocalToken();
  } else {
    writeLocal(next.baseUrl, next.token);
  }
  return next;
}

function scrubLocalToken(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoredGateway;
    if (parsed.token == null || parsed.token === "") {
      if ("token" in parsed) {
        writeLocal(normalizeBaseUrl(parsed.baseUrl ?? ""));
      }
      return;
    }
    writeLocal(normalizeBaseUrl(parsed.baseUrl ?? ""));
  } catch {
    /* ignore */
  }
}

/**
 * Load optional session token from OS keyring (Tauri) and migrate legacy plaintext.
 * Call once at app start before connect.
 */
export async function hydrateSecrets(partial?: GatewayConfig): Promise<GatewayConfig> {
  const base = partial ?? loadConfig();
  if (!isTauri) {
    return {
      baseUrl: normalizeBaseUrl(base.baseUrl),
      token: (base.token || readLegacyToken()).trim(),
    };
  }

  let token = (await secretGet(GATEWAY_TOKEN_ACCOUNT)) ?? "";
  const legacy = readLegacyToken();
  if (!token && legacy) {
    token = legacy;
    try {
      await secretSet(GATEWAY_TOKEN_ACCOUNT, token);
    } catch {
      /* keep in-memory this session */
    }
  }
  scrubLocalToken();
  return {
    baseUrl: normalizeBaseUrl(base.baseUrl || loadConfig().baseUrl),
    token: token.trim(),
  };
}

function readLegacyToken(): string {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as StoredGateway;
    return (parsed.token ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Origin only: trim, strip trailing slash.
 * Missing scheme → http for loopback / private IP / explicit port; else https
 * (aligns with Rakazo Electron Existing public hosts).
 */
export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const hostPort = trimmed.split("/")[0] ?? trimmed;
  const host = hostPort.split(":")[0]?.toLowerCase() ?? "";
  const hasExplicitPort = /:\d+$/.test(hostPort);
  const loopback =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  if (loopback || hasExplicitPort) return `http://${trimmed}`;
  return `https://${trimmed}`;
}

/** API loopback must not be saved as Desktop origin. */
export function isForbiddenApiPort(origin: string): boolean {
  try {
    const url = new URL(normalizeBaseUrl(origin));
    return url.port === "3100";
  } catch {
    return /:3100(?:\/|$)/.test(origin);
  }
}

/** Configured when an origin is set. Login/session is separate. */
export function isConfigured(config: GatewayConfig): boolean {
  return Boolean(config.baseUrl) && !isForbiddenApiPort(config.baseUrl);
}

export function absoluteUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
