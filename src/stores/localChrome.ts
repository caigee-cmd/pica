import { create } from "zustand";

export type Thumb = "up" | "down";

type Overlay = {
  title?: string;
  pinned?: boolean;
  removed?: boolean;
};

type ChromeState = {
  /** bot / group id → local overlay (pin, rename, soft-remove). */
  overlays: Record<string, Overlay>;
  /** `${threadId}:${messageId}` → thumb. */
  thumbs: Record<string, Thumb>;
  pin: (id: string, pinned?: boolean) => void;
  rename: (id: string, title: string) => void;
  removeLocal: (id: string) => void;
  restore: (id: string) => void;
  setThumb: (threadId: string, messageId: string, thumb: Thumb | null) => void;
  getThumb: (threadId: string, messageId: string) => Thumb | null;
};

const KEY = "pica.localChrome";

function load(): Pick<ChromeState, "overlays" | "thumbs"> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { overlays: {}, thumbs: {} };
    const parsed = JSON.parse(raw) as Partial<Pick<ChromeState, "overlays" | "thumbs">>;
    return {
      overlays: parsed.overlays && typeof parsed.overlays === "object" ? parsed.overlays : {},
      thumbs: parsed.thumbs && typeof parsed.thumbs === "object" ? parsed.thumbs : {},
    };
  } catch {
    return { overlays: {}, thumbs: {} };
  }
}

function persist(overlays: Record<string, Overlay>, thumbs: Record<string, Thumb>) {
  localStorage.setItem(KEY, JSON.stringify({ overlays, thumbs }));
}

function thumbKey(threadId: string, messageId: string) {
  return `${threadId}:${messageId}`;
}

export const useLocalChrome = create<ChromeState>((set, get) => ({
  ...load(),

  pin: (id, pinned) => {
    const overlays = { ...get().overlays };
    const nextPinned = pinned ?? !overlays[id]?.pinned;
    overlays[id] = { ...overlays[id], pinned: nextPinned };
    persist(overlays, get().thumbs);
    set({ overlays });
  },

  rename: (id, title) => {
    const overlays = { ...get().overlays };
    overlays[id] = { ...overlays[id], title: title.trim() || overlays[id]?.title };
    persist(overlays, get().thumbs);
    set({ overlays });
  },

  removeLocal: (id) => {
    const overlays = { ...get().overlays };
    overlays[id] = { ...overlays[id], removed: true, pinned: false };
    persist(overlays, get().thumbs);
    set({ overlays });
  },

  restore: (id) => {
    const overlays = { ...get().overlays };
    if (!overlays[id]) return;
    overlays[id] = { ...overlays[id], removed: false };
    persist(overlays, get().thumbs);
    set({ overlays });
  },

  setThumb: (threadId, messageId, thumb) => {
    const thumbs = { ...get().thumbs };
    const key = thumbKey(threadId, messageId);
    if (!thumb) delete thumbs[key];
    else thumbs[key] = thumb;
    persist(get().overlays, thumbs);
    set({ thumbs });
  },

  getThumb: (threadId, messageId) => get().thumbs[thumbKey(threadId, messageId)] ?? null,
}));
