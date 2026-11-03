/**
 * Sidebar attention badges: pending approval / question / login / waiting / unread.
 * Kept in sync with Gateway events (same signals as OS notifications).
 */
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/platform";
import { onProductEvent, useConnection } from "@/stores/connection";
import { useWorkspace } from "@/stores/workspace";
import type { BotStatus, Message, ProductEvent } from "@/types/gateway";
import { messageFromProductEvent, statusFromProductEvent } from "@/lib/rakazoMap";

const STORAGE_KEY = "pica.attention.v1";

export type AttentionKind = "approval" | "question" | "login" | "waiting" | "unread";

export type AttentionEntry = {
  /** Distinct attention kinds currently active for this thread. */
  kinds: AttentionKind[];
  /** Soft unread count for assistant text (capped in UI). */
  unread: number;
  updatedAt: number;
};

type AttentionFile = {
  v: 1;
  byBaseUrl: Record<string, Record<string, AttentionEntry>>;
};

type AttentionStore = {
  byThread: Record<string, AttentionEntry>;
  mark: (threadId: string, kind: AttentionKind, opts?: { unreadDelta?: number }) => void;
  clearThread: (threadId: string) => void;
  clearKind: (threadId: string, kind: AttentionKind) => void;
  hydrateForGateway: (baseUrl?: string) => void;
  syncFromMessages: (threadId: string, messages: Message[]) => void;
  syncFromStatus: (botId: string, state: BotStatus) => void;
  totalCount: () => number;
};

function gatewayBaseUrl(): string {
  return useConnection.getState().config.baseUrl;
}

function readFile(): AttentionFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { v: 1, byBaseUrl: {} };
    const parsed = JSON.parse(raw) as AttentionFile;
    if (parsed?.v !== 1 || typeof parsed.byBaseUrl !== "object") return { v: 1, byBaseUrl: {} };
    return parsed;
  } catch {
    return { v: 1, byBaseUrl: {} };
  }
}

function writeFile(byThread: Record<string, AttentionEntry>) {
  const baseUrl = gatewayBaseUrl();
  if (!baseUrl) return;
  const file = readFile();
  file.byBaseUrl[baseUrl] = byThread;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  } catch {
    /* ignore */
  }
}

function loadFor(baseUrl: string): Record<string, AttentionEntry> {
  if (!baseUrl) return {};
  const entry = readFile().byBaseUrl[baseUrl];
  return entry && typeof entry === "object" ? entry : {};
}

function normalizeKinds(kinds: AttentionKind[]): AttentionKind[] {
  return [...new Set(kinds)];
}

function badgeTone(kinds: AttentionKind[]): "urgent" | "unread" | "done" | null {
  if (kinds.some((k) => k === "approval" || k === "question" || k === "login" || k === "waiting")) {
    return "urgent";
  }
  if (kinds.includes("unread")) return "unread";
  return null;
}

/** Display number for a thread badge (0 = hide). */
export function attentionBadgeCount(entry: AttentionEntry | undefined, seenDone?: boolean): number {
  if (!entry || entry.kinds.length === 0) return seenDone ? 1 : 0;
  const urgent = entry.kinds.filter((k) => k !== "unread").length;
  if (urgent > 0) return Math.max(urgent, entry.unread > 0 ? entry.unread : 1);
  if (entry.unread > 0) return Math.min(entry.unread, 99);
  return seenDone ? 1 : 0;
}

export function attentionIsUrgent(entry: AttentionEntry | undefined): boolean {
  return badgeTone(entry?.kinds ?? []) === "urgent";
}

let trayTimer: ReturnType<typeof setTimeout> | null = null;

async function pushTrayAttention(count: number) {
  if (!isTauri) return;
  try {
    await invoke("set_tray_attention", { count });
  } catch {
    /* command missing / non-desktop */
  }
}

function scheduleTraySync(getTotal: () => number) {
  if (trayTimer) clearTimeout(trayTimer);
  trayTimer = setTimeout(() => {
    trayTimer = null;
    void pushTrayAttention(getTotal());
  }, 120);
}

function messageKind(message: Message): AttentionKind | null {
  if (message.kind === "approval_request") {
    const status =
      message.payload && typeof message.payload === "object" && "status" in message.payload
        ? String((message.payload as { status?: string }).status)
        : "pending";
    return status === "pending" ? "approval" : null;
  }
  if (message.kind === "question") {
    const status =
      message.payload && typeof message.payload === "object" && "status" in message.payload
        ? String((message.payload as { status?: string }).status)
        : "open";
    return status === "open" ? "question" : null;
  }
  if (message.kind === "login_request") return "login";
  if (message.kind === "text" && message.sender !== "user") return "unread";
  return null;
}

export const useAttention = create<AttentionStore>((set, get) => ({
  byThread: loadFor(gatewayBaseUrl() || (typeof localStorage !== "undefined" ? "" : "")),

  mark: (threadId, kind, opts) => {
    if (!threadId) return;
    const selection = useWorkspace.getState().selection;
    // Already viewing this thread — clear happens on open; don't re-badge until they leave + new event.
    if (selection?.threadId === threadId) return;

    set((state) => {
      const prev = state.byThread[threadId];
      const kinds = normalizeKinds([...(prev?.kinds ?? []), kind]);
      const unread =
        kind === "unread"
          ? Math.min(99, (prev?.unread ?? 0) + (opts?.unreadDelta ?? 1))
          : (prev?.unread ?? 0);
      const next = {
        ...state.byThread,
        [threadId]: { kinds, unread, updatedAt: Date.now() },
      };
      writeFile(next);
      scheduleTraySync(() =>
        Object.values(next).reduce((sum, e) => sum + attentionBadgeCount(e), 0),
      );
      return { byThread: next };
    });
  },

  clearThread: (threadId) => {
    if (!threadId) return;
    set((state) => {
      if (!state.byThread[threadId]) return state;
      const next = { ...state.byThread };
      delete next[threadId];
      writeFile(next);
      scheduleTraySync(() =>
        Object.values(next).reduce((sum, e) => sum + attentionBadgeCount(e), 0),
      );
      return { byThread: next };
    });
  },

  clearKind: (threadId, kind) => {
    set((state) => {
      const prev = state.byThread[threadId];
      if (!prev) return state;
      const kinds = prev.kinds.filter((k) => k !== kind);
      const unread = kind === "unread" ? 0 : prev.unread;
      const next = { ...state.byThread };
      if (kinds.length === 0 && unread === 0) delete next[threadId];
      else next[threadId] = { kinds, unread, updatedAt: Date.now() };
      writeFile(next);
      scheduleTraySync(() =>
        Object.values(next).reduce((sum, e) => sum + attentionBadgeCount(e), 0),
      );
      return { byThread: next };
    });
  },

  hydrateForGateway: (baseUrl) => {
    const url = (baseUrl ?? gatewayBaseUrl()).trim();
    const byThread = loadFor(url);
    set({ byThread });
    scheduleTraySync(() =>
      Object.values(byThread).reduce((sum, e) => sum + attentionBadgeCount(e), 0),
    );
  },

  syncFromMessages: (threadId, messages) => {
    const kinds = new Set<AttentionKind>();
    for (const message of messages) {
      const kind = messageKind(message);
      if (!kind || kind === "unread") continue;
      kinds.add(kind);
    }
    // Soft unread from history is noisy after refresh — only keep actionable kinds from scan.
    set((state) => {
      const prev = state.byThread[threadId];
      const nextKinds = normalizeKinds([...kinds]);
      // Preserve unread flag if we already had one and thread not open; don't invent from full history.
      const keepUnread =
        prev?.kinds.includes("unread") &&
        useWorkspace.getState().selection?.threadId !== threadId
          ? (prev.unread || 1)
          : 0;
      const next = { ...state.byThread };
      if (nextKinds.length === 0 && keepUnread === 0) {
        if (prev) {
          delete next[threadId];
          writeFile(next);
          scheduleTraySync(() =>
            Object.values(next).reduce((sum, e) => sum + attentionBadgeCount(e), 0),
          );
        }
        return prev ? { byThread: next } : state;
      }
      const entry: AttentionEntry = {
        kinds: keepUnread > 0 ? normalizeKinds([...nextKinds, "unread"]) : nextKinds,
        unread: keepUnread,
        updatedAt: Date.now(),
      };
      next[threadId] = entry;
      writeFile(next);
      scheduleTraySync(() =>
        Object.values(next).reduce((sum, e) => sum + attentionBadgeCount(e), 0),
      );
      return { byThread: next };
    });
  },

  syncFromStatus: (botId, state) => {
    const bot = useWorkspace.getState().bots.find((b) => b.id === botId);
    const threadId = bot?.thread_id ?? `dm:${botId}`;
    if (state === "blocked" || state === "waiting") {
      get().mark(threadId, state === "blocked" ? "approval" : "waiting");
      return;
    }
    if (state === "idle" || state === "thinking") {
      get().clearKind(threadId, "waiting");
      if (state === "idle") get().clearKind(threadId, "approval");
    }
  },

  totalCount: () =>
    Object.values(get().byThread).reduce((sum, e) => sum + attentionBadgeCount(e), 0),
}));

function applyAttentionEvent(event: ProductEvent) {
  const status = statusFromProductEvent(event);
  if (status) {
    useAttention.getState().syncFromStatus(status.botId, status.status);
  }
  const message = messageFromProductEvent(event);
  if (!message) return;
  const threadId = event.threadId;
  const kind = messageKind(message);
  if (!kind) {
    if (
      message.kind === "approval_resolved" ||
      (message.kind === "question" &&
        message.payload &&
        typeof message.payload === "object" &&
        "status" in message.payload &&
        String((message.payload as { status?: string }).status) !== "open")
    ) {
      const messages = useWorkspace.getState().messages[threadId];
      if (messages) useAttention.getState().syncFromMessages(threadId, messages);
      else {
        useAttention.getState().clearKind(threadId, "approval");
        useAttention.getState().clearKind(threadId, "question");
      }
    }
    return;
  }
  if (kind === "unread") {
    useAttention.getState().mark(threadId, "unread", { unreadDelta: 1 });
    return;
  }
  useAttention.getState().mark(threadId, kind);
}

let wired = false;

export function bindAttentionEvents(): () => void {
  if (wired) return () => undefined;
  wired = true;
  // Initial hydrate for current gateway.
  useAttention.getState().hydrateForGateway();
  scheduleTraySync(() => useAttention.getState().totalCount());
  return onProductEvent((event) => applyAttentionEvent(event));
}
