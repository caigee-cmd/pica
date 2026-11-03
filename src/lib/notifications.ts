/**
 * OS notifications for Gateway events (HuLa-style logic, BoardUI unchanged).
 * Fires when the window is hidden/unfocused or the user is on another thread.
 * Click → show/focus main window + open that bot/group thread.
 */
import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@/lib/platform";
import { onProductEvent } from "@/stores/connection";
import { useWorkspace } from "@/stores/workspace";
import { messageFromProductEvent, statusFromProductEvent } from "@/lib/rakazoMap";
import type { ProductEvent, Message } from "@/types/gateway";
import { playNotifySound } from "@/lib/sounds";

export type NotifyTarget = {
  threadId: string;
  botId?: string;
  kind: "dm" | "group";
};

type NotifyKind = "approval" | "question" | "waiting" | "message" | "login";

const DEBOUNCE_MS = 2800;
const lastSentAt = new Map<string, number>();

let permissionReady: Promise<boolean> | null = null;
let wired = false;

function debounceKey(kind: NotifyKind, threadId: string): string {
  return `${kind}:${threadId}`;
}

function shouldDebounce(kind: NotifyKind, threadId: string): boolean {
  const key = debounceKey(kind, threadId);
  const now = Date.now();
  const prev = lastSentAt.get(key) ?? 0;
  if (now - prev < DEBOUNCE_MS) return true;
  lastSentAt.set(key, now);
  return false;
}

function notifyId(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  }
  const id = Math.abs(hash);
  return id === 0 ? 1 : id;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isTauri) return false;
  if (!permissionReady) {
    permissionReady = (async () => {
      try {
        let granted = await isPermissionGranted();
        if (!granted) {
          const permission = await requestPermission();
          granted = permission === "granted";
        }
        return granted;
      } catch {
        return false;
      }
    })();
  }
  return permissionReady;
}

/** True when the user is already looking at this thread in a focused, visible window. */
export async function isForegroundQuiet(threadId: string): Promise<boolean> {
  if (!isTauri) return true;
  try {
    const win = getCurrentWindow();
    const [focused, visible] = await Promise.all([win.isFocused(), win.isVisible()]);
    if (!focused || !visible) return false;
    const selection = useWorkspace.getState().selection;
    return selection?.threadId === threadId;
  } catch {
    return false;
  }
}

function resolveTargetFromThread(threadId: string): NotifyTarget | null {
  const { bots, groups } = useWorkspace.getState();
  const bot = bots.find((item) => item.thread_id === threadId);
  if (bot) return { threadId, botId: bot.id, kind: "dm" };
  const group = groups.find((item) => item.threadId === threadId || item.id === threadId);
  if (group) return { threadId, botId: undefined, kind: "group" };
  // Gateway DM threads are often `dm:<botId>` — fall back so click still works.
  if (threadId.startsWith("dm:")) {
    const botId = threadId.slice(3);
    return { threadId, botId, kind: "dm" };
  }
  if (threadId.startsWith("group:") || threadId === "group") {
    return { threadId, kind: "group" };
  }
  return { threadId, kind: "group" };
}

function resolveTargetFromBot(botId: string): NotifyTarget | null {
  const bot = useWorkspace.getState().bots.find((item) => item.id === botId);
  if (bot) return { threadId: bot.thread_id, botId: bot.id, kind: "dm" };
  return { threadId: `dm:${botId}`, botId, kind: "dm" };
}

function titleFor(target: NotifyTarget): string {
  const { bots, groups } = useWorkspace.getState();
  if (target.botId) {
    const bot = bots.find((item) => item.id === target.botId);
    if (bot?.name) return bot.name;
  }
  const group = groups.find((item) => item.threadId === target.threadId || item.id === target.threadId);
  return group?.name || "Pica";
}

function clip(text: string, max = 120): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

async function focusMainWindow(): Promise<void> {
  if (!isTauri) return;
  try {
    const win = getCurrentWindow();
    await win.show();
    await win.unminimize();
    await win.setFocus();
  } catch {
    /* ignore */
  }
}

async function openTarget(target: NotifyTarget): Promise<void> {
  const ws = useWorkspace.getState();
  if (target.kind === "dm" && target.botId) {
    await ws.openBot(target.botId);
    return;
  }
  const group = ws.groups.find(
    (g) => g.threadId === target.threadId || g.id === target.threadId,
  );
  await ws.openGroup(group?.id || target.threadId);
}


function parseTarget(extra: Record<string, unknown> | undefined | null): NotifyTarget | null {
  if (!extra) return null;
  const threadId = typeof extra.threadId === "string" ? extra.threadId : "";
  if (!threadId) return null;
  const botId = typeof extra.botId === "string" && extra.botId ? extra.botId : undefined;
  const kind = extra.kind === "dm" ? "dm" : "group";
  return { threadId, botId, kind };
}

async function showOsNotification(opts: {
  kind: NotifyKind;
  target: NotifyTarget;
  title: string;
  body: string;
}): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  if (await isForegroundQuiet(opts.target.threadId)) return;
  if (shouldDebounce(opts.kind, opts.target.threadId)) return;

  try {
    sendNotification({
      id: notifyId(`${opts.kind}:${opts.target.threadId}`),
      title: opts.title,
      body: opts.body,
      extra: {
        threadId: opts.target.threadId,
        botId: opts.target.botId ?? "",
        kind: opts.target.kind,
        notifyKind: opts.kind,
      },
    });
    playNotifySound();
  } catch {
    /* permission revoked mid-flight, etc. */
  }
}

function describeApproval(message: Message): string {
  const payload = message.payload;
  if (payload && typeof payload === "object" && "action" in payload) {
    const action = String((payload as { action?: string }).action ?? "");
    const detail = String((payload as { detail?: string }).detail ?? "");
    return clip([action, detail].filter(Boolean).join(" — ") || message.content || "需要审批");
  }
  return clip(message.content || "需要审批");
}

function describeQuestion(message: Message): string {
  const payload = message.payload;
  if (payload && typeof payload === "object" && "question" in payload) {
    return clip(String((payload as { question?: string }).question || message.content || "需要你的回答"));
  }
  return clip(message.content || "需要你的回答");
}

async function maybeNotifyMessage(threadId: string, message: Message): Promise<void> {
  const target = resolveTargetFromThread(threadId);
  if (!target) return;
  const name = titleFor(target);

  if (message.kind === "approval_request") {
    const status =
      message.payload && typeof message.payload === "object" && "status" in message.payload
        ? String((message.payload as { status?: string }).status)
        : "pending";
    if (status !== "pending") return;
    await showOsNotification({
      kind: "approval",
      target,
      title: `${name} · 待审批`,
      body: describeApproval(message),
    });
    return;
  }

  if (message.kind === "question") {
    const status =
      message.payload && typeof message.payload === "object" && "status" in message.payload
        ? String((message.payload as { status?: string }).status)
        : "open";
    if (status !== "open") return;
    await showOsNotification({
      kind: "question",
      target,
      title: `${name} · 需要回答`,
      body: describeQuestion(message),
    });
    return;
  }

  if (message.kind === "login_request") {
    const site =
      message.payload && typeof message.payload === "object" && "site" in message.payload
        ? String((message.payload as { site?: string }).site ?? "")
        : "";
    await showOsNotification({
      kind: "login",
      target,
      title: `${name} · 需要登录`,
      body: clip(site || message.content || "请在本机完成登录"),
    });
    return;
  }

  // Optional: new assistant text while backgrounded.
  if (message.kind === "text" && message.sender !== "user") {
    await showOsNotification({
      kind: "message",
      target,
      title: `${name} · 新消息`,
      body: clip(message.content || "有一条新回复"),
    });
  }
}

async function maybeNotifyStatus(botId: string, state: string): Promise<void> {
  if (state !== "waiting" && state !== "blocked") return;
  const target = resolveTargetFromBot(botId);
  if (!target) return;
  const name = titleFor(target);
  if (state === "blocked") {
    await showOsNotification({
      kind: "approval",
      target,
      title: `${name} · 待审批`,
      body: "机器人被拦截，等待你的批准",
    });
    return;
  }
  await showOsNotification({
    kind: "waiting",
    target,
    title: `${name} · 等待中`,
    body: "机器人正在等你回复",
  });
}

export async function maybeNotifyProductEvent(event: ProductEvent): Promise<void> {
  if (!isTauri) return;
  if (event.type === "heartbeat") return;
  const status = statusFromProductEvent(event);
  if (status) await maybeNotifyStatus(status.botId, status.status);
  const message = messageFromProductEvent(event);
  if (message) await maybeNotifyMessage(event.threadId, message);
}

/**
 * Request permission (macOS prompt on first need), listen for notification taps,
 * and mirror Gateway events into OS notifications.
 */
export function bindOsNotifications(): () => void {
  if (!isTauri) return () => undefined;
  if (wired) return () => undefined;
  wired = true;

  void ensureNotificationPermission();

  let unlistenAction: (() => void) | undefined;
  void onAction((event) => {
    const target = parseTarget(
      (event.notification?.extra as Record<string, unknown> | undefined) ?? null,
    );
    void (async () => {
      await focusMainWindow();
      if (target) await openTarget(target);
    })();
  })
    .then((listener) => {
      unlistenAction = () => {
        void listener.unregister();
      };
    })
    .catch(() => {
      /* older plugin / unsupported */
    });

  const unEvent = onProductEvent((event) => {
    void maybeNotifyProductEvent(event);
  });

  return () => {
    wired = false;
    unEvent();
    unlistenAction?.();
  };
}
