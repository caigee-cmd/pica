import { create } from "zustand";
import { normalizeShape, type ShapeId } from "@/lib/avatarShapes";

export type { ShapeId };
export { SHAPE_PRESETS } from "@/lib/avatarShapes";

export type EmotionId = "neutral" | "angry" | "sleepy" | "happy" | "focused";

export type PermissionMode = "auto" | "manual" | "plan" | "bypass";

export type AppearanceMode = "light" | "dark" | "system";

export type AgentLook = {
  name: string;
  label: string;
  description: string;
  color: string;
  emotion: EmotionId;
  shape: ShapeId;
};

export type ComposerPrefs = {
  permission: PermissionMode;
  planMode: boolean;
  modelId: string;
};

const AGENT_KEY = "pica.agentLooks";
const COMPOSER_KEY = "pica.composerPrefs";
const APPEARANCE_KEY = "pica.appearance";
const SIDEBAR_WIDTH_KEY = "pica.sidebarWidth";
const EDITOR_WIDTH_KEY = "pica.editorWidth";
const CLOSE_TO_TRAY_KEY = "pica.closeToTray";
const SHELL_KEY = "pica.shellPrefs";

/** Desktop left rail — HuLa-style clamp, BoardUI default 280. */
export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 420;
export const SIDEBAR_WIDTH_DEFAULT = 280;

export function clampSidebarWidth(px: number): number {
  if (!Number.isFinite(px)) return SIDEBAR_WIDTH_DEFAULT;
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(px)));
}

/** Desktop right agent / computer / routines rail. */
export const EDITOR_WIDTH_MIN = 240;
export const EDITOR_WIDTH_MAX = 480;
export const EDITOR_WIDTH_DEFAULT = 300;

export function clampEditorWidth(px: number): number {
  if (!Number.isFinite(px)) return EDITOR_WIDTH_DEFAULT;
  return Math.min(EDITOR_WIDTH_MAX, Math.max(EDITOR_WIDTH_MIN, Math.round(px)));
}

export const COLOR_PRESETS = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#059669",
  "#0d9488",
  "#ca8a04",
  "#52525b",
] as const;

export const EMOTION_PRESETS: { id: EmotionId; label: string }[] = [
  { id: "neutral", label: "Neutral" },
  { id: "happy", label: "Happy" },
  { id: "focused", label: "Focused" },
  { id: "angry", label: "Angry" },
  { id: "sleepy", label: "Sleepy" },
];

export const PERMISSION_OPTIONS: { id: PermissionMode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Ask when unsure" },
  { id: "manual", label: "Manual", hint: "Confirm every tool" },
  { id: "plan", label: "Plan", hint: "Plan before acting" },
  { id: "bypass", label: "Bypass", hint: "Run without prompts" },
];

/** Fallback until bots.models / catalog is loaded — stubs removed. */
export const MODEL_PLACEHOLDERS: { id: string; label: string; group: string }[] = [
  { id: "gateway-default", label: "Gateway default", group: "Auto" },
];

const DEFAULT_COMPOSER: ComposerPrefs = {
  permission: "auto",
  planMode: false,
  modelId: "gateway-default",
};

function loadAgents(): Record<string, AgentLook> {
  try {
    const raw = localStorage.getItem(AGENT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<AgentLook>>;
    const out: Record<string, AgentLook> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      out[id] = {
        name: String(value.name ?? ""),
        label: String(value.label ?? ""),
        description: String(value.description ?? ""),
        color: String(value.color ?? COLOR_PRESETS[0]),
        emotion: normalizeEmotion(value.emotion),
        shape: normalizeShape(value.shape),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function normalizeEmotion(value: unknown): EmotionId {
  if (
    value === "angry" ||
    value === "sleepy" ||
    value === "neutral" ||
    value === "happy" ||
    value === "focused"
  ) {
    return value;
  }
  return "neutral";
}

function loadComposer(): ComposerPrefs {
  try {
    const raw = localStorage.getItem(COMPOSER_KEY);
    if (!raw) return { ...DEFAULT_COMPOSER };
    const parsed = JSON.parse(raw) as Partial<ComposerPrefs>;
    const permission =
      parsed.permission === "manual" ||
      parsed.permission === "plan" ||
      parsed.permission === "bypass" ||
      parsed.permission === "auto"
        ? parsed.permission
        : "auto";
    const modelId =
      typeof parsed.modelId === "string" && parsed.modelId
        ? parsed.modelId
        : DEFAULT_COMPOSER.modelId;
    return {
      permission,
      planMode: Boolean(parsed.planMode),
      modelId,
    };
  } catch {
    return { ...DEFAULT_COMPOSER };
  }
}

function loadAppearance(): AppearanceMode {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* ignore */
  }
  return "system";
}

function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (raw == null) return SIDEBAR_WIDTH_DEFAULT;
    return clampSidebarWidth(Number(raw));
  } catch {
    return SIDEBAR_WIDTH_DEFAULT;
  }
}

function loadEditorWidth(): number {
  try {
    const raw = localStorage.getItem(EDITOR_WIDTH_KEY);
    if (raw == null) return EDITOR_WIDTH_DEFAULT;
    return clampEditorWidth(Number(raw));
  } catch {
    return EDITOR_WIDTH_DEFAULT;
  }
}


export type SendKeyMode = "enter" | "modEnter";

export type ShellPrefs = {
  /** 开机自启（与 tauri-plugin-autostart 同步） */
  autostartEnabled: boolean;
  /** 启动时若有持久会话则自动进入主窗 */
  autoLogin: boolean;
  /** 全局快捷键总开关（默认关） */
  globalShortcutEnabled: boolean;
  /** 唤起/隐藏主窗 */
  globalShortcutToggle: string;
  /** 是否注册截图快捷键 */
  globalShortcutScreenshotEnabled: boolean;
  globalShortcutScreenshot: string;
  /** 截图前隐藏主窗 */
  screenshotHideWindow: boolean;
  /** 新消息提示音 */
  soundEnabled: boolean;
  /** 0–1 */
  soundVolume: number;
  /** Enter 发送 vs ⌘/Ctrl+Enter 发送 */
  sendKey: SendKeyMode;
};

const DEFAULT_SHELL: ShellPrefs = {
  autostartEnabled: false,
  autoLogin: true,
  globalShortcutEnabled: false,
  globalShortcutToggle: "CommandOrControl+Shift+P",
  globalShortcutScreenshotEnabled: false,
  globalShortcutScreenshot: "CommandOrControl+Shift+A",
  screenshotHideWindow: true,
  soundEnabled: true,
  soundVolume: 0.5,
  sendKey: "enter",
};

function loadShell(): ShellPrefs {
  try {
    const raw = localStorage.getItem(SHELL_KEY);
    if (!raw) return { ...DEFAULT_SHELL };
    const parsed = JSON.parse(raw) as Partial<ShellPrefs>;
    const sendKey: SendKeyMode =
      parsed.sendKey === "modEnter" ? "modEnter" : "enter";
    const vol =
      typeof parsed.soundVolume === "number" && Number.isFinite(parsed.soundVolume)
        ? Math.min(1, Math.max(0, parsed.soundVolume))
        : DEFAULT_SHELL.soundVolume;
    return {
      autostartEnabled: Boolean(parsed.autostartEnabled),
      autoLogin: parsed.autoLogin === false ? false : true,
      globalShortcutEnabled: Boolean(parsed.globalShortcutEnabled),
      globalShortcutToggle:
        typeof parsed.globalShortcutToggle === "string" && parsed.globalShortcutToggle.trim()
          ? parsed.globalShortcutToggle.trim()
          : DEFAULT_SHELL.globalShortcutToggle,
      globalShortcutScreenshotEnabled: Boolean(parsed.globalShortcutScreenshotEnabled),
      globalShortcutScreenshot:
        typeof parsed.globalShortcutScreenshot === "string" &&
        parsed.globalShortcutScreenshot.trim()
          ? parsed.globalShortcutScreenshot.trim()
          : DEFAULT_SHELL.globalShortcutScreenshot,
      screenshotHideWindow: parsed.screenshotHideWindow === false ? false : true,
      soundEnabled: parsed.soundEnabled === false ? false : true,
      soundVolume: vol,
      sendKey,
    };
  } catch {
    return { ...DEFAULT_SHELL };
  }
}


function loadCloseToTray(): boolean {
  try {
    const raw = localStorage.getItem(CLOSE_TO_TRAY_KEY);
    if (raw === "0" || raw === "false") return false;
    if (raw === "1" || raw === "true") return true;
  } catch {
    /* ignore */
  }
  return true;
}

type PrefsStore = {
  agents: Record<string, AgentLook>;
  composer: ComposerPrefs;
  appearance: AppearanceMode;
  /** Left sidebar width in px (desktop). */
  sidebarWidth: number;
  /** Right editor rail width in px (desktop). */
  editorWidth: number;
  /** Close main window → hide to tray (HuLa/Lulu shell). */
  closeToTray: boolean;
  autostartEnabled: boolean;
  autoLogin: boolean;
  globalShortcutEnabled: boolean;
  globalShortcutToggle: string;
  globalShortcutScreenshotEnabled: boolean;
  globalShortcutScreenshot: string;
  screenshotHideWindow: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  sendKey: SendKeyMode;
  setShell: (patch: Partial<ShellPrefs>) => void;
  upsertAgent: (botId: string, patch: Partial<AgentLook>) => void;
  ensureAgent: (
    botId: string,
    seed: { name: string; label: string; description: string; color: string },
  ) => AgentLook;
  setComposer: (patch: Partial<ComposerPrefs>) => void;
  setAppearance: (mode: AppearanceMode) => void;
  setCloseToTray: (enabled: boolean) => void;
  /** Sync close-to-tray into Rust atomics (Tauri). */
  hydrateDesktopShell: () => Promise<void>;
  /**
   * Resize left rail. Pass `persist: false` while dragging; persist on pointerup.
   * Always updates in-memory width so Titlebar `--sidebar-w` stays aligned.
   */
  setSidebarWidth: (px: number, opts?: { persist?: boolean }) => void;
  /**
   * Resize right rail. Pass `persist: false` while dragging; persist on pointerup.
   * Always updates in-memory width so Titlebar `--editor-w` stays aligned.
   */
  setEditorWidth: (px: number, opts?: { persist?: boolean }) => void;
};

export const usePrefs = create<PrefsStore>((set, get) => ({
  agents: loadAgents(),
  composer: loadComposer(),
  appearance: loadAppearance(),
  sidebarWidth: loadSidebarWidth(),
  editorWidth: loadEditorWidth(),
  closeToTray: loadCloseToTray(),
  ...loadShell(),

  setShell: (patch) => {
    const prev = {
      autostartEnabled: get().autostartEnabled,
      autoLogin: get().autoLogin,
      globalShortcutEnabled: get().globalShortcutEnabled,
      globalShortcutToggle: get().globalShortcutToggle,
      globalShortcutScreenshotEnabled: get().globalShortcutScreenshotEnabled,
      globalShortcutScreenshot: get().globalShortcutScreenshot,
      screenshotHideWindow: get().screenshotHideWindow,
      soundEnabled: get().soundEnabled,
      soundVolume: get().soundVolume,
      sendKey: get().sendKey,
    };
    const shell: ShellPrefs = { ...prev, ...patch };
    try {
      localStorage.setItem(SHELL_KEY, JSON.stringify(shell));
    } catch {
      /* ignore */
    }
    set({ ...shell });
    // Side effects: autostart + shortcuts (best-effort).
    void (async () => {
      try {
        if (patch.autostartEnabled !== undefined) {
          const { setAutostartEnabled } = await import("@/lib/autostart");
          await setAutostartEnabled(shell.autostartEnabled);
        }
      } catch {
        /* ignore */
      }
      try {
        if (
          patch.globalShortcutEnabled !== undefined ||
          patch.globalShortcutToggle !== undefined ||
          patch.globalShortcutScreenshotEnabled !== undefined ||
          patch.globalShortcutScreenshot !== undefined
        ) {
          const { syncGlobalShortcuts } = await import("@/lib/globalShortcuts");
          await syncGlobalShortcuts();
        }
      } catch {
        /* ignore */
      }
    })();
  },

  ensureAgent: (botId, seed) => {
    const existing = get().agents[botId];
    if (existing) return existing;
    const next: AgentLook = {
      name: seed.name,
      label: seed.label,
      description: seed.description,
      color: seed.color,
      emotion: "neutral",
      shape: "circle",
    };
    const agents = { ...get().agents, [botId]: next };
    localStorage.setItem(AGENT_KEY, JSON.stringify(agents));
    set({ agents });
    return next;
  },

  upsertAgent: (botId, patch) => {
    const prev = get().agents[botId];
    const next: AgentLook = {
      name: patch.name ?? prev?.name ?? "",
      label: patch.label ?? prev?.label ?? "",
      description: patch.description ?? prev?.description ?? "",
      color: patch.color ?? prev?.color ?? COLOR_PRESETS[0],
      emotion: patch.emotion ?? prev?.emotion ?? "neutral",
      shape: patch.shape ?? prev?.shape ?? "circle",
    };
    const agents = { ...get().agents, [botId]: next };
    localStorage.setItem(AGENT_KEY, JSON.stringify(agents));
    set({ agents });
  },

  setComposer: (patch) => {
    const composer = { ...get().composer, ...patch };
    localStorage.setItem(COMPOSER_KEY, JSON.stringify(composer));
    set({ composer });
  },

  setAppearance: (mode) => {
    try {
      localStorage.setItem(APPEARANCE_KEY, mode);
    } catch {
      /* ignore */
    }
    set({ appearance: mode });
    void (async () => {
      try {
        const { isTauri } = await import("@/lib/platform");
        if (!isTauri) return;
        const { emit } = await import("@tauri-apps/api/event");
        await emit("pica-appearance", { mode });
      } catch {
        /* ignore */
      }
    })();
  },

  setCloseToTray: (enabled) => {
    try {
      localStorage.setItem(CLOSE_TO_TRAY_KEY, enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ closeToTray: enabled });
    void (async () => {
      try {
        const { isTauri } = await import("@/lib/platform");
        if (!isTauri) return;
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_close_to_tray", { enabled });
      } catch {
        /* ignore */
      }
    })();
  },

  hydrateDesktopShell: async () => {
    try {
      const { isTauri } = await import("@/lib/platform");
      if (!isTauri) return;
      const { invoke } = await import("@tauri-apps/api/core");
      const enabled = get().closeToTray;
      await invoke("set_close_to_tray", { enabled });
    } catch {
      /* ignore */
    }
  },

  setSidebarWidth: (px, opts) => {
    const next = clampSidebarWidth(px);
    set({ sidebarWidth: next });
    if (opts?.persist !== false) {
      try {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
      } catch {
        /* ignore */
      }
    }
  },

  setEditorWidth: (px, opts) => {
    const next = clampEditorWidth(px);
    set({ editorWidth: next });
    if (opts?.persist !== false) {
      try {
        localStorage.setItem(EDITOR_WIDTH_KEY, String(next));
      } catch {
        /* ignore */
      }
    }
  },
}));

/** Keep appearance in sync across Tauri windows (settings ↔ main ↔ login). */
function bindAppearanceSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("storage", (event) => {
    if (event.key !== APPEARANCE_KEY) return;
    const raw = event.newValue;
    if (raw === "light" || raw === "dark" || raw === "system") {
      usePrefs.setState({ appearance: raw });
    }
  });
  void (async () => {
    try {
      const { isTauri } = await import("@/lib/platform");
      if (!isTauri) return;
      const { listen } = await import("@tauri-apps/api/event");
      await listen<{ mode?: string }>("pica-appearance", (event) => {
        const mode = event.payload?.mode;
        if (mode === "light" || mode === "dark" || mode === "system") {
          usePrefs.setState({ appearance: mode });
        }
      });
    } catch {
      /* ignore */
    }
  })();
}

bindAppearanceSync();
