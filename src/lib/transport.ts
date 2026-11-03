import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { GatewayConfig } from "@/types/gateway";

type ProxyResponse = {
  status: number;
  contentType: string;
  bodyBase64: string;
  /** Lowercase header names from Rust (includes set-auth-token after sign-in). */
  headers?: Record<string, string>;
};


type SubscribeStatus = {
  state: "connecting" | "live" | "error" | "closed";
  detail: string;
};

function decodeBody(bodyBase64: string): Uint8Array {
  const binary = atob(bodyBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * HTTP via Tauri shell (reqwest + cookie jar). Avoids webview CORS
 * (`tauri://localhost` is not on Rakazo trusted origins).
 */
export async function gatewayFetch(
  config: GatewayConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? init.body : undefined;
  const result = await invoke<ProxyResponse>("gateway_request", {
    req: {
      baseUrl: config.baseUrl,
      token: (config.token ?? "").trim(),
      method,
      path,
      body: body ?? null,
    },
  });
  const bytes = decodeBody(result.bodyBase64);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const headerInit: Record<string, string> = {
    "content-type": result.contentType || "application/octet-stream",
  };
  if (result.headers) {
    for (const [k, v] of Object.entries(result.headers)) {
      if (k && v != null) headerInit[k] = v;
    }
  }
  return new Response(new Blob([copy]), {
    status: result.status,
    headers: headerInit,
  });
}

/** Low-level invoke shape used by some helpers. */
export async function request(args: {
  baseUrl: string;
  token: string;
  method: string;
  path: string;
  body?: string;
}): Promise<ProxyResponse> {
  return invoke<ProxyResponse>("gateway_request", {
    req: {
      baseUrl: args.baseUrl,
      token: (args.token ?? "").trim(),
      method: args.method,
      path: args.path,
      body: args.body ?? null,
    },
  });
}

/** Read `set-auth-token` from a gatewayFetch Response (case-insensitive). */
export function readSetAuthToken(res: Response): string {
  return (
    res.headers.get("set-auth-token") ??
    res.headers.get("Set-Auth-Token") ??
    ""
  ).trim();
}

/**
 * oRPC call: POST /rpc/<procedure> with body `{"json": ...}`.
 * Procedure may use dots (`bots.list`) or slashes (`bots/list`); URL uses slashes.
 */
export async function rpc<T = unknown>(
  config: GatewayConfig,
  procedure: string,
  json: unknown = {},
): Promise<T> {
  const pathProc = procedure.replace(/^\/+/, "").replace(/\./g, "/");
  const path = `/rpc/${pathProc}`;
  const res = await gatewayFetch(config, path, {
    method: "POST",
    body: JSON.stringify({ json }),
  });
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new Error(`RPC ${procedure}: invalid JSON (${res.status})`);
  }
  const envelope = payload as { json?: T; error?: unknown };
  if (!res.ok) {
    const errObj = envelope as {
      json?: { message?: string; code?: string; status?: number };
    };
    const msg =
      errObj.json?.message ??
      (typeof envelope === "object" && envelope && "message" in (envelope as object)
        ? String((envelope as { message?: string }).message)
        : null) ??
      `RPC ${procedure} failed (${res.status})`;
    const err = new Error(msg) as Error & { status: number; code?: string };
    err.status = errObj.json?.status ?? res.status;
    err.code = errObj.json?.code;
    throw err;
  }
  if (envelope && typeof envelope === "object" && "json" in envelope) {
    return envelope.json as T;
  }
  return payload as T;
}

/**
 * Start Rakazo `threads.subscribe` SSE via Tauri (cookie jar + Bearer).
 * `onEvent` receives peeled ProductEvent JSON objects.
 */
export async function openThreadSubscribe(
  config: GatewayConfig,
  input: { botId?: string; groupId?: string; cursor: number },
  onEvent: (event: unknown) => void,
  onStatus: (state: SubscribeStatus["state"], detail: string) => void,
): Promise<() => void> {
  const path = "/rpc/threads/subscribe";
  const body = JSON.stringify({ json: input });
  const unlistenEvent = await listen<string>("rpc-subscribe-event", (payload) => {
    try {
      onEvent(JSON.parse(payload.payload) as unknown);
    } catch {
      /* ignore malformed */
    }
  });
  const unlistenStatus = await listen<SubscribeStatus>("rpc-subscribe-status", (payload) => {
    onStatus(payload.payload.state, payload.payload.detail || "");
  });
  await invoke("gateway_subscribe", {
    baseUrl: config.baseUrl,
    token: (config.token ?? "").trim(),
    path,
    body,
  });
  return () => {
    unlistenEvent();
    unlistenStatus();
    void invoke("gateway_unsubscribe");
  };
}

export async function closeThreadSubscribe(): Promise<void> {
  await invoke("gateway_unsubscribe");
}

/** Clear Rust cookie jar + on-disk jar (call on sign-out). Keyring Bearer cleared separately. */
export async function clearGatewayCookies(): Promise<void> {
  try {
    await invoke("gateway_clear_cookies");
  } catch {
    /* ignore when not in Tauri / command missing */
  }
}

