import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "@/modules/bots/Sidebar";
import { ThreadView } from "@/modules/chat/ThreadView";
import { BoardsPanel } from "@/modules/boards/BoardsPanel";
import { CallPanel } from "@/modules/call/CallPanel";
import { MemoryPanel } from "@/modules/memory/MemoryPanel";
import { RoutinePanel } from "@/modules/routines/RoutinePanel";
import { ScreenPanel } from "@/modules/screen/ScreenPanel";
import { SkillsPanel } from "@/modules/skills/SkillsPanel";
import { AgentEditor } from "@/modules/agent/AgentEditor";
import { SettingsView } from "@/modules/settings/SettingsView";
// MarketplaceDialog / SupportDialog stubs — not mounted
import { GroupPickerDialog } from "@/modules/group/GroupPickerDialog";
import { GroupSettingsPanel } from "@/modules/group/GroupSettingsPanel";
import { CreateBotDialog } from "@/modules/bots/CreateBotDialog";
import { RenameDialog } from "@/modules/bots/RenameDialog";
import { isConfigured } from "@/lib/config";
import { isTauri } from "@/lib/platform";
import {
  closeLoginWindow,
  focusMainWindow,
  hideMainWindow,
  openLoginWindow,
  openSettingsWindow,
} from "@/lib/windows";
import { bindWorkspaceEvents, useWorkspace } from "@/stores/workspace";
import { bindOsNotifications } from "@/lib/notifications";
import { bindAttentionEvents } from "@/stores/attention";
import { useConnection } from "@/stores/connection";
import { usePrefs } from "@/stores/prefs";
import { useUi } from "@/stores/ui";
import { Titlebar } from "@/components/Titlebar";
import { useResolvedDark } from "@/hooks/useResolvedDark";
import gsap from "gsap";
import { animateEditorRail } from "@/lib/motion";

const NARROW_MQ = "(max-width: 749px)";

async function presentLoginShell() {
  if (!isTauri) return false;
  try {
    await openLoginWindow();
    await hideMainWindow();
    return true;
  } catch {
    return false;
  }
}

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Inline settings only when login OS window cannot open (browser / failure). */
  const [inlineLogin, setInlineLogin] = useState(false);
  const connect = useConnection((s) => s.connect);
  const hydrateConfig = useConnection((s) => s.hydrateConfig);
  const state = useConnection((s) => s.state);
  const detail = useConnection((s) => s.detail);
  const signedIn = useConnection((s) => s.signedIn);
  const error = useWorkspace((s) => s.error);
  const clearError = useWorkspace((s) => s.clearError);
  const panel = useWorkspace((s) => s.panel);
  const selection = useWorkspace((s) => s.selection);
  const dark = useResolvedDark();
  const narrow = useUi((s) => s.narrow);
  const setNarrow = useUi((s) => s.setNarrow);
  const railOpen = useUi((s) => s.railOpen);
  const editorOpen = useUi((s) => s.editorOpen);
  const setRailOpen = useUi((s) => s.setRailOpen);
  const setEditorOpen = useUi((s) => s.setEditorOpen);
  const toast = useUi((s) => s.toast);
  const sidebarWidth = usePrefs((s) => s.sidebarWidth);
  const editorWidth = usePrefs((s) => s.editorWidth);
  const setEditorWidth = usePrefs((s) => s.setEditorWidth);
  const hydrateDesktopShell = usePrefs((s) => s.hydrateDesktopShell);
  const config = useConnection((s) => s.config);

  /** Configured + signed-in → OS settings; else login window / inline. */
  const handleOpenSettings = useCallback(() => {
    if (!isConfigured(config) || !signedIn) {
      void presentLoginShell().then((ok) => {
        if (!ok) {
          setInlineLogin(true);
          setSettingsOpen(true);
        }
      });
      return;
    }
    void openSettingsWindow().catch(() => setSettingsOpen(true));
  }, [config, signedIn]);

  useEffect(() => {
    const unbind = bindWorkspaceEvents();
    const unNotify = bindOsNotifications();
    const unAttention = bindAttentionEvents();
    let cancelled = false;
    let unlistenSession: (() => void) | undefined;

    void (async () => {
      try {
        await hydrateDesktopShell();
      } catch {
        /* ignore */
      }
      if (isTauri) {
        try {
          unlistenSession = await listen<{ signedIn?: boolean }>("pica-session", (event) => {
            if (cancelled) return;
            if (event.payload?.signedIn) {
              void (async () => {
                try {
                  await hydrateConfig();
                  await connect();
                  setInlineLogin(false);
                  setSettingsOpen(false);
                  await focusMainWindow();
                  await closeLoginWindow();
                } catch {
                  /* keep login visible */
                }
              })();
            }
          });
        } catch {
          /* non-tauri / event unavailable */
        }
      }

      try {
        const hydrated = await hydrateConfig();
        if (cancelled) return;
        if (!isConfigured(hydrated)) {
          const ok = await presentLoginShell();
          if (!ok) {
            setInlineLogin(true);
            setSettingsOpen(true);
          }
          return;
        }
        await connect();
        if (cancelled) return;
        const sessionOk = useConnection.getState().signedIn;
        const autoLogin = usePrefs.getState().autoLogin;
        if (!sessionOk || !autoLogin) {
          // No session, or user disabled auto-login → show login gate.
          const ok = await presentLoginShell();
          if (!ok) {
            setInlineLogin(true);
            setSettingsOpen(true);
          }
        } else {
          await closeLoginWindow();
          if (isTauri) await focusMainWindow();
        }
      } catch {
        if (!cancelled) {
          const ok = await presentLoginShell();
          if (!ok) {
            setInlineLogin(true);
            setSettingsOpen(true);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      unbind();
      unNotify();
      unAttention();
      unlistenSession?.();
    };
  }, [connect, hydrateConfig, hydrateDesktopShell]);

  useEffect(() => {
    if (state === "live" && signedIn) {
      setSettingsOpen(false);
      setInlineLogin(false);
      void closeLoginWindow();
      if (isTauri) void focusMainWindow();
    }
  }, [state, signedIn]);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_MQ);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [setNarrow]);

  const showRail = !narrow || railOpen;
  const showEditorNarrow =
    narrow && (editorOpen || panel === "computer" || panel === "routines" || panel === "memory" || panel === "skills" || panel === "boards" || panel === "call");
  const editorWidthPx = editorWidth;
  const sidebarWidthPx = sidebarWidth;
  const editorRailRef = useRef<HTMLDivElement>(null);
  const editorDraggingRef = useRef(false);
  /** Live px for Titlebar `--editor-w` during GSAP / drag. */
  const [editorWLive, setEditorWLive] = useState(() => (editorOpen ? editorWidth : 0));

  const editorAnimPrev = useRef<{ open: boolean; width: number } | null>(null);

  useLayoutEffect(() => {
    if (narrow || settingsOpen) {
      editorAnimPrev.current = null;
      setEditorWLive(0);
      return;
    }
    const el = editorRailRef.current;
    if (!el) return;
    if (editorDraggingRef.current) {
      setEditorWLive(editorWidthPx);
      gsap.set(el, { width: editorWidthPx });
      return;
    }
    const prev = editorAnimPrev.current;
    const targetOpen = editorOpen;
    // First paint: snap (no tween) so Titlebar/`--editor-w` align immediately.
    if (!prev) {
      const w = targetOpen ? editorWidthPx : 0;
      gsap.set(el, { width: w });
      setEditorWLive(w);
      editorAnimPrev.current = { open: targetOpen, width: editorWidthPx };
      return;
    }
    // Width-only change while open (resize) — snap, don't replay collapse tween.
    if (prev.open === targetOpen && targetOpen && prev.width !== editorWidthPx) {
      gsap.set(el, { width: editorWidthPx });
      setEditorWLive(editorWidthPx);
      editorAnimPrev.current = { open: targetOpen, width: editorWidthPx };
      return;
    }
    if (prev.open === targetOpen && prev.width === editorWidthPx) return;
    editorAnimPrev.current = { open: targetOpen, width: editorWidthPx };
    animateEditorRail(el, {
      open: targetOpen,
      width: editorWidthPx,
      onUpdate: (w) => setEditorWLive(w),
    });
  }, [editorOpen, editorWidthPx, narrow, settingsOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (settingsOpen) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.key !== "\\") return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" ||
          event.target.tagName === "TEXTAREA" ||
          event.target.isContentEditable)
      ) {
        // Still allow — panel toggle is global chrome
      }
      event.preventDefault();
      setEditorOpen(!useUi.getState().editorOpen);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, setEditorOpen]);

  const onEditorResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (narrow || !editorOpen || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startW = usePrefs.getState().editorWidth;
    editorDraggingRef.current = true;
    if (editorRailRef.current) gsap.killTweensOf(editorRailRef.current);
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("pica-resizing-editor");

    const onMove = (ev: PointerEvent) => {
      if (!editorDraggingRef.current) return;
      // Dragging the left edge of the editor: move left → wider
      const next = startW + (startX - ev.clientX);
      setEditorWidth(next, { persist: false });
      setEditorWLive(usePrefs.getState().editorWidth);
      if (editorRailRef.current) {
        editorRailRef.current.style.width = `${usePrefs.getState().editorWidth}px`;
      }
    };
    const onUp = (ev: PointerEvent) => {
      editorDraggingRef.current = false;
      document.body.classList.remove("pica-resizing-editor");
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setEditorWidth(usePrefs.getState().editorWidth, { persist: true });
      setEditorWLive(usePrefs.getState().editorWidth);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };


  // When login OS window owns the gate, keep main chrome minimal / empty.
  const gatedOut = isTauri && !signedIn && !inlineLogin && !settingsOpen;

  return (
    <div className={dark ? "dark h-full" : "h-full"}>
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-paper)] text-[var(--color-ink)]"
        style={
          {
            ["--sidebar-w" as string]: `${sidebarWidthPx}px`,
            ["--editor-w" as string]: narrow || settingsOpen ? "0px" : `${editorWLive}px`,
          } as CSSProperties
        }
      >
        <Titlebar />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {settingsOpen ? (
          <SettingsView
            onClose={() => {
              setSettingsOpen(false);
              setInlineLogin(false);
            }}
          />
        ) : gatedOut ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--color-muted)]">
            请在登录窗口完成 Existing instance 登录…
          </div>
        ) : (
          <>
            {error ? (
              <div className="flex items-center justify-between gap-3 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                <span className="min-w-0 truncate">{error}</span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium underline"
                  onClick={() => clearError()}
                >
                  关闭
                </button>
              </div>
            ) : null}
            {detail && state !== "live" ? (
              <div className="border-b border-[var(--color-line)] px-4 py-1.5 text-xs text-[var(--color-muted)]">
                {detail}
              </div>
            ) : null}
            <main className="relative flex min-h-0 flex-1 overflow-hidden">
              <div
                className={
                  narrow
                    ? showRail
                      ? "absolute inset-0 z-40 flex bg-[var(--color-paper)]"
                      : "hidden"
                    : "contents"
                }
              >
                <Sidebar
                  onOpenSettings={handleOpenSettings}
                  onNavigate={() => setRailOpen(false)}
                />
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-hidden">
                  {narrow ? (
                    <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2">
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-white/5"
                        onClick={() => setRailOpen(true)}
                      >
                        会话
                      </button>
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-white/5"
                        onClick={() => setEditorOpen(true)}
                      >
                        面板
                      </button>
                    </div>
                  ) : null}
                  <ThreadView />
                </div>
                <div
                  className={
                    narrow
                      ? showEditorNarrow
                        ? "absolute inset-0 z-40 flex bg-[var(--color-paper)]"
                        : "hidden"
                      : settingsOpen
                        ? "hidden"
                        : "relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden"
                  }
                  /* Width owned by GSAP / resize drag — do not bind editorOpen here */
                  ref={narrow ? undefined : editorRailRef}
                >
                  {narrow || settingsOpen ? null : (
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize agent panel"
                      aria-valuenow={editorWidthPx}
                      aria-valuemin={240}
                      aria-valuemax={480}
                      onPointerDown={onEditorResizePointerDown}
                      className="pica-editor-resize absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none"
                      style={{ pointerEvents: editorOpen ? "auto" : "none" }}
                    />
                  )}
                  <div
                    className={
                      narrow
                        ? "flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[var(--color-surface)]"
                        : "flex h-full min-h-0 w-full min-w-[240px] flex-col overflow-hidden border-l border-[color-mix(in_srgb,var(--color-line)_80%,transparent)] bg-[var(--color-surface)]"
                    }
                    style={
                      narrow || settingsOpen
                        ? undefined
                        : { width: editorWidthPx, minWidth: editorWidthPx }
                    }
                  >
                    {panel === "computer" ? (
                      <ScreenPanel />
                    ) : panel === "routines" ? (
                      <RoutinePanel />
                    ) : panel === "memory" ? (
                      <MemoryPanel />
                    ) : panel === "skills" ? (
                      <SkillsPanel />
                    ) : panel === "boards" ? (
                      <BoardsPanel />
                    ) : panel === "call" ? (
                      <CallPanel />
                    ) : selection?.kind === "group" ? (
                      <GroupSettingsPanel />
                    ) : (
                      <AgentEditor />
                    )}
                  </div>
                </div>
              </div>
            </main>
          </>
        )}
        </div>
      </div>
      {/* Marketplace / Support stubs not mounted */}
      <GroupPickerDialog />
      <CreateBotDialog />
      <RenameDialog />
      {toast ? (
        <div
          role="status"
          className="pica-toast pointer-events-none fixed bottom-24 left-1/2 z-[70] max-w-[min(92vw,28rem)] -translate-x-1/2 rounded-full bg-zinc-900 px-3.5 py-2 text-center text-xs font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
