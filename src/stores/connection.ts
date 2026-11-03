import { create } from "zustand";
import { GatewayClient, GatewayError, SignedOut } from "@/lib/gateway";
import { clearGatewayCookies } from "@/lib/transport";
import { hydrateSecrets, isConfigured, loadConfig, saveConfig } from "@/lib/config";
import type { ConnectionState, GatewayConfig, ProductEvent } from "@/types/gateway";

type ConnectionStore = {
  config: GatewayConfig;
  /** False until keyring / migration finished (Tauri). */
  secretsReady: boolean;
  state: ConnectionState;
  detail: string | null;
  client: GatewayClient | null;
  /** True after me / bots.list succeeds with current session. */
  signedIn: boolean;
  sessionLabel: string | null;
  hydrateConfig: () => Promise<GatewayConfig>;
  setConfig: (config: GatewayConfig) => Promise<GatewayConfig>;
  connect: () => Promise<void>;
  /** HTTP session + client only — no WebSocket (child windows). */
  connectHttpOnly: () => Promise<void>;
  disconnect: () => void;
  /** Email/password → Better Auth; saves Bearer if present; then connect. */
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

let stopStream: (() => void) | null = null;
const listeners = new Set<(event: ProductEvent) => void>();
let hydratePromise: Promise<GatewayConfig> | null = null;

export function onProductEvent(listener: (event: ProductEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitProductEvent(event: ProductEvent) {
  for (const listener of listeners) listener(event);
}

function onBaseUrlChange(prevUrl: string, nextUrl: string) {
  if (nextUrl === prevUrl) return;
  void import("@/stores/workspace").then(({ useWorkspace }) => {
    useWorkspace.getState().hydrateForGateway(nextUrl);
  });
  void import("@/stores/attention").then(({ useAttention }) => {
    useAttention.getState().hydrateForGateway(nextUrl);
  });
}

async function refreshRosterSoon() {
  const { useWorkspace } = await import("@/stores/workspace");
  await useWorkspace.getState().refreshRoster();
}

/**
 * Probe path: health (required) → me or bots.list when session may exist.
 * Cookie jar may hold a session even without a local Bearer token.
 */
async function probeAfterHealth(
  client: GatewayClient,
): Promise<{ signedIn: boolean; sessionLabel: string | null; detail: string | null }> {
  try {
    const me = await client.fetchMe();
    const label =
      me.user?.email ||
      me.email ||
      me.user?.name ||
      me.name ||
      me.user?.id ||
      me.id ||
      "已登录";
    return { signedIn: true, sessionLabel: String(label), detail: null };
  } catch (err) {
    if (err instanceof SignedOut) {
      return {
        signedIn: false,
        sessionLabel: null,
        detail: "服务器可达，但尚未登录。请在下方用邮箱密码登录。",
      };
    }
    // me may be unavailable on older builds — try bots.list as session probe.
    try {
      await client.fetchBots();
      return { signedIn: true, sessionLabel: "已登录", detail: null };
    } catch (err2) {
      if (err2 instanceof SignedOut) {
        return {
          signedIn: false,
          sessionLabel: null,
          detail: "服务器可达，但尚未登录。请在下方用邮箱密码登录。",
        };
      }
      // Reachable + unknown me shape: still mark live without claiming login.
      return {
        signedIn: false,
        sessionLabel: null,
        detail: err instanceof Error ? err.message : "会话探测失败",
      };
    }
  }
}

export const useConnection = create<ConnectionStore>((set, get) => ({
  config: loadConfig(),
  secretsReady: false,
  state: "idle",
  detail: null,
  client: null,
  signedIn: false,
  sessionLabel: null,

  hydrateConfig: async () => {
    if (!hydratePromise) {
      hydratePromise = (async () => {
        const hydrated = await hydrateSecrets(get().config);
        set({ config: hydrated, secretsReady: true });
        return hydrated;
      })().catch((err) => {
        hydratePromise = null;
        set({ secretsReady: true });
        throw err;
      });
    }
    return hydratePromise;
  },

  setConfig: async (config) => {
    const prevUrl = get().config.baseUrl;
    const saved = await saveConfig(config);
    set({ config: saved, secretsReady: true });
    onBaseUrlChange(prevUrl, saved.baseUrl);
    return saved;
  },

  disconnect: () => {
    stopStream?.();
    stopStream = null;
    void import("@/stores/workspace").then(({ teardownThreadSubscribe }) => {
      teardownThreadSubscribe();
    });
    set({
      state: "idle",
      detail: null,
      client: null,
      signedIn: false,
      sessionLabel: null,
    });
  },

  connectHttpOnly: async () => {
    if (!get().secretsReady) {
      try {
        await get().hydrateConfig();
      } catch {
        /* continue with whatever we have */
      }
    }
    const { config } = get();
    if (!isConfigured(config)) {
      set({
        state: "idle",
        detail: "请先在设置里填写 Rakazo 服务器地址。",
        client: null,
        signedIn: false,
        sessionLabel: null,
      });
      return;
    }
    set({ state: "connecting", detail: null });
    const client = new GatewayClient(config);
    try {
      await client.checkHealth();
    } catch (err) {
      const message =
        err instanceof GatewayError ? err.message : "无法连接 Rakazo 服务器。";
      set({
        state: "error",
        detail: message,
        client: null,
        signedIn: false,
        sessionLabel: null,
      });
      return;
    }
    const session = await probeAfterHealth(client);
    set({
      client,
      state: "live",
      detail: session.detail,
      signedIn: session.signedIn,
      sessionLabel: session.sessionLabel,
    });
  },

  connect: async () => {
    if (!get().secretsReady) {
      try {
        await get().hydrateConfig();
      } catch {
        /* hydrateConfig already flipped secretsReady in catch; continue */
      }
    }
    const { config } = get();
    if (!isConfigured(config)) {
      set({
        state: "idle",
        detail: "请先在设置里填写 Rakazo 服务器地址。",
        client: null,
        signedIn: false,
        sessionLabel: null,
      });
      return;
    }
    stopStream?.();
    stopStream = null;
    set({ state: "connecting", detail: null });
    const client = new GatewayClient(config);
    try {
      await client.checkHealth();
    } catch (err) {
      const message =
        err instanceof GatewayError ? err.message : "无法连接 Rakazo 服务器。";
      set({
        state: "error",
        detail: message,
        client: null,
        signedIn: false,
        sessionLabel: null,
      });
      return;
    }
    // Live chat: workspace opens threads.subscribe per selection.
    const session = await probeAfterHealth(client);
    stopStream = null;
    set({
      client,
      state: "live",
      detail: session.detail,
      signedIn: session.signedIn,
      sessionLabel: session.sessionLabel,
    });
    if (session.signedIn) await refreshRosterSoon();
  },

  signIn: async (email, password) => {
    if (!get().secretsReady) {
      try {
        await get().hydrateConfig();
      } catch {
        /* continue */
      }
    }
    let { config } = get();
    if (!isConfigured(config)) {
      throw new GatewayError(0, "请先填写并保存 Rakazo 服务器地址。");
    }
    const client = new GatewayClient(config);
    await client.checkHealth();
    const auth = await client.signInEmail(email, password);
    config = await get().setConfig({
      baseUrl: config.baseUrl,
      token: auth.token || config.token || "",
    });
    const next = new GatewayClient(config);
    const session = await probeAfterHealth(next);
    stopStream?.();
    stopStream = null;
    set({
      client: next,
      state: "live",
      detail: session.signedIn
        ? null
        : session.detail ?? "登录响应已收到，但会话探测未通过。",
      signedIn: session.signedIn,
      sessionLabel:
        session.sessionLabel ||
        auth.user?.email ||
        auth.user?.name ||
        email.trim(),
    });
    if (session.signedIn) await refreshRosterSoon();
    if (!session.signedIn) {
      throw new GatewayError(401, session.detail || "登录后会话无效，请重试。");
    }
  },

  signUp: async (email, password, name) => {
    if (!get().secretsReady) {
      try {
        await get().hydrateConfig();
      } catch {
        /* continue */
      }
    }
    let { config } = get();
    if (!isConfigured(config)) {
      throw new GatewayError(0, "请先填写并保存 Rakazo 服务器地址。");
    }
    const client = new GatewayClient(config);
    await client.checkHealth();
    const auth = await client.signUpEmail(email, password, name);
    config = await get().setConfig({
      baseUrl: config.baseUrl,
      token: auth.token || "",
    });
    const next = new GatewayClient(config);
    const session = await probeAfterHealth(next);
    stopStream?.();
    stopStream = null;
    set({
      client: next,
      state: "live",
      detail: session.detail,
      signedIn: session.signedIn,
      sessionLabel:
        session.sessionLabel ||
        auth.user?.email ||
        auth.user?.name ||
        email.trim(),
    });
    if (session.signedIn) await refreshRosterSoon();
    if (!session.signedIn) {
      throw new GatewayError(401, session.detail || "注册后会话无效，请尝试登录。");
    }
  },

  signOut: async () => {
    const { client, config } = get();
    try {
      if (client) await client.signOut();
    } catch {
      /* still clear local */
    }
    await clearGatewayCookies();
    const saved = await get().setConfig({ baseUrl: config.baseUrl, token: "" });
    set({
      config: saved,
      client: new GatewayClient(saved),
      signedIn: false,
      sessionLabel: null,
      detail: "已退出登录。服务器仍可达。",
      state: isConfigured(saved) ? "live" : "idle",
    });
  },
}));
