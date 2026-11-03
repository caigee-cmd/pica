import { create } from "zustand";

export type Toast = { id: number; message: string } | null;

export type RenameTarget = { id: string; title: string; kind?: "bot" | "group" } | null;

type UiStore = {
  marketplaceOpen: boolean;
  railOpen: boolean;
  editorOpen: boolean;
  narrow: boolean;
  supportOpen: boolean;
  groupPickerOpen: boolean;
  createBotOpen: boolean;
  renameTarget: RenameTarget;
  /** Sidebar search → ThreadView scroll/highlight. */
  pendingFocusMessageId: string | null;
  toast: Toast;
  setMarketplaceOpen: (open: boolean) => void;
  setRailOpen: (open: boolean) => void;
  setEditorOpen: (open: boolean) => void;
  setNarrow: (narrow: boolean) => void;
  setSupportOpen: (open: boolean) => void;
  setGroupPickerOpen: (open: boolean) => void;
  setCreateBotOpen: (open: boolean) => void;
  setRenameTarget: (target: RenameTarget) => void;
  setPendingFocusMessageId: (id: string | null) => void;
  showToast: (message: string) => void;
  clearToast: () => void;
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let toastSeq = 0;

export const useUi = create<UiStore>((set) => ({
  marketplaceOpen: false,
  railOpen: false,
  editorOpen: true,  // desktop default open; narrow drawers start closed via setNarrow
  narrow: false,
  supportOpen: false,
  groupPickerOpen: false,
  createBotOpen: false,
  renameTarget: null,
  pendingFocusMessageId: null,
  toast: null,

  setMarketplaceOpen: (open) => set({ marketplaceOpen: open }),
  setRailOpen: (open) => set({ railOpen: open }),
  setEditorOpen: (open) => set({ editorOpen: open }),
  setSupportOpen: (open) => set({ supportOpen: open }),
  setGroupPickerOpen: (open) => set({ groupPickerOpen: open }),
  setCreateBotOpen: (open) => set({ createBotOpen: open }),
  setRenameTarget: (target) => set({ renameTarget: target }),
  setPendingFocusMessageId: (id) => set({ pendingFocusMessageId: id }),
  setNarrow: (narrow) =>
    set({
      narrow,
      // Narrow: drawers closed. Desktop: right rail open by default.
      railOpen: false,
      editorOpen: !narrow,
    }),

  showToast: (message) => {
    if (toastTimer) clearTimeout(toastTimer);
    toastSeq += 1;
    const id = toastSeq;
    set({ toast: { id, message } });
    toastTimer = setTimeout(() => {
      set((s) => (s.toast?.id === id ? { toast: null } : s));
    }, 2200);
  },
  clearToast: () => set({ toast: null }),
}));
