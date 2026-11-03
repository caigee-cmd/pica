/**
 * OS keyring helpers (Tauri desktop).
 * Service: com.pica.desktop · account: gateway-token (optional Rakazo session / Bearer).
 * Browser / Vite-only: no-ops (callers fall back to in-memory / localStorage).
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/platform";

export const GATEWAY_TOKEN_ACCOUNT = "gateway-token";

export async function secretGet(account: string): Promise<string | null> {
  if (!isTauri) return null;
  try {
    const value = await invoke<string | null>("secret_get", { account });
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function secretSet(account: string, secret: string): Promise<void> {
  if (!isTauri) return;
  await invoke("secret_set", { account, secret });
}

export async function secretDelete(account: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("secret_delete", { account });
  } catch {
    /* ignore */
  }
}
