import { isTauri } from "@/lib/platform";

export type ClientUpdateResult =
  | { status: "unavailable"; detail: string }
  | { status: "up-to-date"; detail: string }
  | { status: "available"; version: string; detail: string; update: ClientUpdateHandle }
  | { status: "error"; detail: string };

export type ClientUpdateHandle = {
  version: string;
  downloadAndInstall: (onEvent?: (e: unknown) => void) => Promise<void>;
};

/**
 * Client-side Tauri updater (shell). Distinct from server `updater.*` RPC.
 * Endpoint / pubkey are stubs until release channel is configured.
 */
export async function checkClientUpdate(): Promise<ClientUpdateResult> {
  if (!isTauri) {
    return { status: "unavailable", detail: "仅桌面客户端支持自动更新" };
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      return { status: "up-to-date", detail: "已是最新版本" };
    }
    return {
      status: "available",
      version: update.version,
      detail: `发现新版本 ${update.version}`,
      update,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/endpoint|pubkey|empty|not configured|404|failed to fetch|JSON/i.test(msg) || !msg.trim()) {
      return {
        status: "unavailable",
        detail:
          "客户端更新端点尚未配置（tauri.conf → plugins.updater.endpoints / pubkey）。详见 docs/shell-native.md",
      };
    }
    return { status: "error", detail: msg };
  }
}

export async function installClientUpdate(update: ClientUpdateHandle): Promise<string> {
  await update.downloadAndInstall();
  return "更新已下载安装，请重启应用以完成更新";
}
