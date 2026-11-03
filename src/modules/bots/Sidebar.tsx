import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ChevronUp,
  Monitor,
  Moon,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { ContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { StatusDot } from "@/components/StatusDot";
import { fadeQuick, selectRailItem, tapRailItem } from "@/lib/motion";
import { cn, formatTime, previewText } from "@/lib/utils";
import { useConnection } from "@/stores/connection";
import { isTauri } from "@/lib/platform";
import { hideMainWindow, openLoginWindow } from "@/lib/windows";
import { useLocalChrome } from "@/stores/localChrome";
import {
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  usePrefs,
  type AppearanceMode,
} from "@/stores/prefs";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";
import {
  attentionBadgeCount,
  attentionIsUrgent,
  useAttention,
} from "@/stores/attention";
import type { Group, Message, SearchHit } from "@/types/gateway";

function lastLine(message: Message | null): string {
  if (!message) return "暂无消息";
  if (message.kind === "approval_request") return "Needs a decision";
  if (message.kind === "question") return "Asked a question";
  if (message.kind === "report") return "Filed a report";
  return previewText(message.content) || message.kind.replaceAll("_", " ");
}

type MenuState = { x: number; y: number; id: string; kind: "bot" | "group" } | null;

export function Sidebar({
  onOpenSettings,
  onNavigate,
}: {
  onOpenSettings: () => void;
  onNavigate?: () => void;
}) {
  const bots = useWorkspace((s) => s.bots);
  const groupsList = useWorkspace((s) => s.groups);
  const statuses = useWorkspace((s) => s.statuses);
  const seenDone = useWorkspace((s) => s.seenDone);
  const byThread = useAttention((s) => s.byThread);
  const attentionTotal = useAttention((s) =>
    Object.values(s.byThread).reduce((sum, e) => sum + attentionBadgeCount(e), 0),
  );
  const selection = useWorkspace((s) => s.selection);
  const openBot = useWorkspace((s) => s.openBot);
  const openGroup = useWorkspace((s) => s.openGroup);
  const state = useConnection((s) => s.state);
  const agentLooks = usePrefs((s) => s.agents);
  const setGroupPickerOpen = useUi((s) => s.setGroupPickerOpen);
  const setCreateBotOpen = useUi((s) => s.setCreateBotOpen);
  const setRenameTarget = useUi((s) => s.setRenameTarget);
  const setEditorOpen = useUi((s) => s.setEditorOpen);
  const showToast = useUi((s) => s.showToast);
  const client = useConnection((s) => s.client);
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const overlays = useLocalChrome((s) => s.overlays);
  const pin = useLocalChrome((s) => s.pin);
  const removeLocal = useLocalChrome((s) => s.removeLocal);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchWrap = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [serverHits, setServerHits] = useState<SearchHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const sidebarWidth = usePrefs((s) => s.sidebarWidth);
  const setSidebarWidth = usePrefs((s) => s.setSidebarWidth);
  const narrow = useUi((s) => s.narrow);
  const draggingRef = useRef(false);

  const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (narrow || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startW = usePrefs.getState().sidebarWidth;
    draggingRef.current = true;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("pica-resizing-sidebar");

    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      setSidebarWidth(startW + (ev.clientX - startX), { persist: false });
    };
    const onUp = (ev: PointerEvent) => {
      if (!draggingRef.current && ev.type === "pointercancel") {
        /* still clean up */
      }
      draggingRef.current = false;
      document.body.classList.remove("pica-resizing-sidebar");
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setSidebarWidth(usePrefs.getState().sidebarWidth, { persist: true });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  useEffect(() => {
    if (!searchOpen) return;
    fadeQuick(searchWrap.current);
    searchInput.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) {
      setServerHits([]);
      return;
    }
    const qRaw = query.trim();
    if (!qRaw || !client) {
      setServerHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setSearchBusy(true);
      void client
        .searchQuery(qRaw)
        .then((out) => {
          if (!cancelled) setServerHits(Array.isArray(out.hits) ? out.hits : []);
        })
        .catch(() => {
          if (!cancelled) setServerHits([]);
        })
        .finally(() => {
          if (!cancelled) setSearchBusy(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, searchOpen, client]);

  useEffect(() => {
    if (!createOpen) return;
    const onDown = (event: globalThis.MouseEvent) => {
      if (!createRef.current?.contains(event.target as Node)) setCreateOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [createOpen]);

  // If session is live but roster stayed empty (stale cache / missed refresh), pull bots.list once.
  useEffect(() => {
    if (state !== "live") return;
    if (!client) return;
    if (bots.length > 0 || groupsList.length > 0) return;
    void useWorkspace.getState().refreshRoster();
  }, [state, client, bots.length, groupsList.length]);

  const openCreateBot = () => {
    setCreateOpen(false);
    if (!client) {
      showToast("Connect a gateway in Settings first");
      return;
    }
    setCreateBotOpen(true);
    onNavigate?.();
  };

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuery("");
        setSearchOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  const q = query.trim().toLowerCase();

  const visibleBots = useMemo(() => {
    const list = bots
      .filter((bot) => !overlays[bot.id]?.removed)
      .filter((bot) => {
        if (!q) return true;
        const title = (overlays[bot.id]?.title || agentLooks[bot.id]?.name || bot.name).toLowerCase();
        const preview = lastLine(bot.last_message).toLowerCase();
        return title.includes(q) || preview.includes(q) || bot.id.toLowerCase().includes(q);
      });
    return list.sort((a, b) => Number(Boolean(overlays[b.id]?.pinned)) - Number(Boolean(overlays[a.id]?.pinned)));
  }, [bots, overlays, agentLooks, q]);

  const groups = useMemo(() => {
    const list = groupsList
      .filter((item) => !overlays[item.id]?.removed)
      .filter((item) => {
        if (!q) return true;
        const title = (overlays[item.id]?.title || item.name).toLowerCase();
        const preview = (item.preview || "").toLowerCase();
        return title.includes(q) || preview.includes(q) || item.id.toLowerCase().includes(q);
      });
    return list.sort(
      (a, b) =>
        Number(Boolean(overlays[b.id]?.pinned || b.pinned)) -
        Number(Boolean(overlays[a.id]?.pinned || a.pinned)),
    );
  }, [groupsList, overlays, q]);

  const openMenuAt = (event: ReactMouseEvent, id: string, kind: "bot" | "group") => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, id, kind });
  };

  const menuItems = (): ContextMenuItem[] => {
    if (!menu) return [];
    const id = menu.id;
    const pinned = Boolean(overlays[id]?.pinned);
    const items: ContextMenuItem[] = [
      {
        id: "pin",
        label: pinned ? "Unpin" : "Pin",
        onSelect: () => {
          pin(id);
          showToast(pinned ? "Unpinned" : "Pinned");
        },
      },
      {
        id: "rename",
        label: "Rename",
        hint: "local",
        onSelect: () => {
          const current =
            overlays[id]?.title ||
            (menu.kind === "bot"
              ? agentLooks[id]?.name || bots.find((b) => b.id === id)?.name || id
              : groupsList.find((c) => c.id === id)?.name || id);
          setRenameTarget({ id, title: current, kind: menu.kind });
        },
      },
    ];
    if (menu.kind === "bot") {
      items.push({
        id: "edit",
        label: "Edit bot",
        onSelect: () => {
          void openBot(id);
          setEditorOpen(true);
          onNavigate?.();
        },
      });
    }
    items.push({
      id: "copy",
      label: "Copy conversation id",
      onSelect: () => {
        void navigator.clipboard.writeText(id).then(
          () => showToast("Copied id"),
          () => showToast("Copy failed"),
        );
      },
    });
    if (client) {
      items.push({
        id: "archive",
        label: "Archive",
        onSelect: () => {
          void (async () => {
            try {
              if (menu.kind === "bot") await useWorkspace.getState().archiveBotRemote(id);
              else await useWorkspace.getState().archiveGroupRemote(id);
              showToast("Archived");
            } catch (err) {
              showToast(err instanceof Error ? err.message : "Archive failed");
            }
          })();
        },
      });
      items.push({
        id: "remove",
        label: "Remove",
        danger: true,
        onSelect: () => {
          if (
            !window.confirm(
              menu.kind === "bot"
                ? "Permanently remove this bot on the gateway?"
                : "Permanently remove this group on the gateway?",
            )
          ) {
            return;
          }
          void (async () => {
            try {
              if (menu.kind === "bot") await useWorkspace.getState().removeBotRemote(id);
              else await useWorkspace.getState().removeGroupRemote(id);
              showToast("Removed");
            } catch (err) {
              showToast(err instanceof Error ? err.message : "Remove failed");
            }
          })();
        },
      });
    } else {
      items.push({
        id: "remove",
        label: "Remove",
        hint: "local",
        danger: true,
        onSelect: () => {
          if (!window.confirm("Hide this conversation locally? Roster sync stays intact.")) return;
          removeLocal(id);
          showToast("Hidden locally");
        },
      });
    }
    return items;
  };

  return (
    <aside
      className="relative flex h-full min-h-0 shrink-0 flex-col border-r border-[color-mix(in_srgb,var(--color-line)_80%,transparent)] bg-[var(--color-surface)] dark:border-white/10"
      style={{ width: sidebarWidth }}
    >
      <div className="flex shrink-0 items-center justify-end gap-2 px-4 py-2.5">
        <div className="flex shrink-0 items-center gap-1.5">
          <div ref={createRef} className="relative">
            <button
              type="button"
              onClick={() => setCreateOpen((v) => !v)}
              className="inline-flex size-8 items-center justify-center rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              aria-label="Create"
              title="Create"
            >
              <Plus size={16} />
            </button>
            {createOpen ? (
              <div className="absolute top-[calc(100%+6px)] right-0 z-30 min-w-[220px] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-soft)]">
                <button
                  type="button"
                  className="flex w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/8"
                  onClick={openCreateBot}
                >
                  New bot
                </button>
                <button
                  type="button"
                  className="flex w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/8"
                  onClick={() => {
                    setCreateOpen(false);
                    setGroupPickerOpen(true);
                  }}
                >
                  New group chat
                </button>
                {/* Marketplace stub hidden */}
              </div>
            ) : null}
          </div>
          {/* Marketplace entry hidden — stub */}
        </div>
      </div>

      <div className="shrink-0 px-3 pb-2">
        {searchOpen ? (
          <div
            ref={searchWrap}
            className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-zinc-50 px-2.5 dark:border-white/10 dark:bg-white/5"
          >
            <Search size={14} className="shrink-0 text-[var(--color-muted)]" />
            <input
              ref={searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search bots, groups, messages"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted)]"
              aria-label="Search bots and groups"
            />
            <button
              type="button"
              className="rounded-full p-1 text-[var(--color-muted)] hover:bg-zinc-200/80 dark:hover:bg-white/10"
              aria-label="Close search"
              onClick={() => {
                setQuery("");
                setSearchOpen(false);
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="px-1 text-[11px] font-semibold tracking-wider text-[var(--color-muted)] uppercase">
              Threads
            </p>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex size-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition hover:bg-zinc-200 dark:bg-white/8 dark:text-zinc-200 dark:hover:bg-white/12"
              aria-label="Search bots and groups"
              title="Search"
            >
              <Search size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="pica-scroll flex min-h-0 flex-1 flex-col overflow-auto px-2 pb-3">
        {searchOpen && q ? (
          <p className="px-2 pb-1 text-[11px] text-[var(--color-muted)]">
            {visibleBots.length + groups.length} local
            {serverHits.length ? ` · ${serverHits.length} server` : ""}
            {searchBusy ? " · …" : ""}
          </p>
        ) : null}

        {searchOpen && q && serverHits.length > 0 ? (
          <>
            <Section label="Gateway search" />
            <ul className="mb-2 space-y-0.5">
              {serverHits.slice(0, 12).map((hit, i) => {
                const key = `${hit.kind}:${hit.messageId || hit.botId || hit.groupId || hit.routineId || hit.url || hit.title}:${i}`;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-0.5 rounded-xl px-2.5 py-2 text-left hover:bg-zinc-100 dark:hover:bg-white/8"
                      onClick={() => {
                        if (hit.messageId) {
                          useUi.getState().setPendingFocusMessageId(hit.messageId);
                        }
                        if (hit.botId) {
                          void openBot(hit.botId);
                          onNavigate?.();
                        } else if (hit.groupId) {
                          void openGroup(hit.groupId);
                          onNavigate?.();
                        } else if (hit.routineId) {
                          useWorkspace.getState().setPanel("routines");
                          useUi.getState().setEditorOpen(true);
                          onNavigate?.();
                        }
                        setQuery("");
                        setSearchOpen(false);
                        setServerHits([]);
                      }}
                    >
                      <span className="truncate text-sm font-medium text-[var(--color-ink)]">
                        {hit.title}
                      </span>
                      <span className="truncate text-[11px] text-[var(--color-muted)]">
                        {hit.kind}
                        {hit.snippet ? ` · ${hit.snippet}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {!searchOpen ? null : <Section label="Results" hide={!q} />}
        {!searchOpen ? <Section label="Teammates" /> : null}

        {visibleBots.length === 0 && groups.length === 0 ? (
          q ? (
            <p className="px-2 py-3 text-sm text-[var(--color-muted)]">没有匹配的会话。</p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col justify-center px-1 py-2">
              <EmptyState
                compact
                title={state === "live" ? "还没有机器人" : "尚未连接"}
                subtitle={
                  state === "live"
                    ? "登录后可创建机器人。"
                    : "先在设置里连接并登录，名单会出现在这里。"
                }
                actions={
                  <>
                    {state === "live" ? (
                      <>
                        <button
                          type="button"
                          className="rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-[11px] font-semibold text-white"
                          onClick={openCreateBot}
                        >
                          创建机器人
                        </button>
                        {/* Marketplace stub hidden */}
                      </>
                    ) : (
                      <button
                        type="button"
                        className="rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-[11px] font-semibold text-white"
                        onClick={onOpenSettings}
                      >
                        打开设置
                      </button>
                    )}
                  </>
                }
              />
            </div>
          )
        ) : (
          visibleBots.map((bot) => {
            const title = overlays[bot.id]?.title || agentLooks[bot.id]?.name || bot.name;
            return (
              <RosterRow
                key={bot.id}
                active={selection?.kind === "dm" && selection.botId === bot.id}
                title={title}
                emoji={bot.emoji}
                id={bot.id}
                preview={lastLine(bot.last_message)}
                time={bot.last_message?.created_at}
                badge={attentionBadgeCount(byThread[bot.thread_id], seenDone[bot.id])}
                badgeTone={
                  attentionIsUrgent(byThread[bot.thread_id])
                    ? "urgent"
                    : attentionBadgeCount(byThread[bot.thread_id]) > 0
                      ? "unread"
                      : seenDone[bot.id]
                        ? "done"
                        : undefined
                }
                status={seenDone[bot.id] ? "done" : (statuses[bot.id] ?? "idle")}
                pinned={Boolean(overlays[bot.id]?.pinned)}
                onClick={() => {
                  void openBot(bot.id);
                  onNavigate?.();
                }}
                onContextMenu={(event) => openMenuAt(event, bot.id, "bot")}
                onMore={(event) => openMenuAt(event, bot.id, "bot")}
              />
            );
          })
        )}

        {groups.length > 0 ? <Section label="Groups" /> : null}
        {groups.map((group) => (
          <GroupRow
            key={group.id}
            group={{
              ...group,
              name: overlays[group.id]?.title || group.name,
            }}
            statuses={statuses}
            active={selection?.kind === "group" && selection.groupId === group.id}
            pinned={Boolean(overlays[group.id]?.pinned)}
            attention={byThread[group.threadId || group.id]}
            onClick={() => {
              void openGroup(group.id);
              onNavigate?.();
            }}
            onContextMenu={(event) => openMenuAt(event, group.id, "group")}
            onMore={(event) => openMenuAt(event, group.id, "group")}
          />
        ))}

        <ArchivedSection onNavigate={onNavigate} />
      </div>

      <AccountFooter onOpenSettings={onOpenSettings} attentionTotal={attentionTotal} />

      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} />
      ) : null}

      {/* Desktop resize — HuLa DesktopLayout logic, BoardUI hairline hit target */}
      {narrow ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={SIDEBAR_WIDTH_MIN}
          aria-valuemax={SIDEBAR_WIDTH_MAX}
          aria-valuenow={sidebarWidth}
          title="Drag to resize"
          onPointerDown={onResizePointerDown}
          className="pica-sidebar-resize absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize touch-none"
        />
      )}
    </aside>
  );
}

function ArchivedSection({ onNavigate }: { onNavigate?: () => void }) {
  const client = useConnection((s) => s.client);
  const signedIn = useConnection((s) => s.signedIn);
  const showToast = useUi((s) => s.showToast);
  const openBot = useWorkspace((s) => s.openBot);
  const openGroup = useWorkspace((s) => s.openGroup);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bots, setBots] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    if (!client) return;
    setBusy(true);
    try {
      const [ab, ag] = await Promise.all([
        client.listArchivedBots(),
        client.listArchivedGroups(),
      ]);
      setBots(ab.map((b) => ({ id: b.id, name: b.name })));
      setGroups(ag.map((g) => ({ id: g.id, name: g.name })));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Archived load failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open || !signedIn) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signedIn, client]);

  if (!signedIn) return null;
  const count = bots.length + groups.length;

  return (
    <div className="mt-2 border-t border-[color-mix(in_srgb,var(--color-line)_70%,transparent)] pt-2 dark:border-white/10">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-[13px] text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-white/8"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="archived-section-trigger"
      >
        <span>Archived{count && open ? ` · ${count}` : ""}</span>
        <span className="text-[11px]">{open ? "Hide" : "Show"}{busy ? "…" : ""}</span>
      </button>
      {open ? (
        <div className="flex flex-col gap-0.5 pb-1">
          {bots.length === 0 && groups.length === 0 && !busy ? (
            <p className="px-2.5 py-2 text-[11px] text-[var(--color-muted)]">No archived chats</p>
          ) : null}
          {bots.map((b) => (
            <div
              key={`ab:${b.id}`}
              className="flex items-center gap-1 rounded-xl px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-white/8"
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm"
                onClick={() => {
                  void openBot(b.id);
                  onNavigate?.();
                }}
              >
                {b.name}
              </button>
              <button
                type="button"
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--color-accent)] hover:bg-zinc-200/70 dark:hover:bg-white/10"
                onClick={() => {
                  void (async () => {
                    try {
                      await useWorkspace.getState().restoreBotRemote(b.id);
                      showToast("Restored");
                      await load();
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : "Restore failed");
                    }
                  })();
                }}
              >
                Restore
              </button>
            </div>
          ))}
          {groups.map((g) => (
            <div
              key={`ag:${g.id}`}
              className="flex items-center gap-1 rounded-xl px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-white/8"
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm"
                onClick={() => {
                  void openGroup(g.id);
                  onNavigate?.();
                }}
              >
                {g.name}
              </button>
              <button
                type="button"
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--color-accent)] hover:bg-zinc-200/70 dark:hover:bg-white/10"
                onClick={() => {
                  void (async () => {
                    try {
                      await useWorkspace.getState().restoreGroupRemote(g.id);
                      showToast("Restored");
                      await load();
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : "Restore failed");
                    }
                  })();
                }}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}


function AccountFooter({
  onOpenSettings,
  attentionTotal = 0,
}: {
  onOpenSettings: () => void;
  attentionTotal?: number;
}) {
  const [open, setOpen] = useState(false);
  const appearance = usePrefs((s) => s.appearance);
  const setAppearance = usePrefs((s) => s.setAppearance);
  const showToast = useUi((s) => s.showToast);
  const menuRef = useRef<HTMLDivElement>(null);
  const config = useConnection((s) => s.config);
  const signedIn = useConnection((s) => s.signedIn);
  const signOut = useConnection((s) => s.signOut);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: globalThis.MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const host = (() => {
    try {
      return config.baseUrl ? new URL(config.baseUrl).host : "Not connected";
    } catch {
      return "Gateway";
    }
  })();

  const cycleAppearance = () => {
    const order: AppearanceMode[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(appearance) + 1) % order.length] ?? "system";
    setAppearance(next);
  };

  return (
    <div ref={menuRef} className="relative mt-auto shrink-0 border-t border-[var(--color-line)] p-2 dark:border-white/10">
      {open ? (
        <div className="absolute bottom-[calc(100%+6px)] left-2 right-2 z-20 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-soft)]">
          <FooterRow
            label="Appearance"
            hint={appearance}
            icon={
              appearance === "light" ? (
                <Sun size={14} />
              ) : appearance === "dark" ? (
                <Moon size={14} />
              ) : (
                <Monitor size={14} />
              )
            }
            onClick={cycleAppearance}
          />
          <FooterRow
            label="Settings"
            icon={<Settings size={14} />}
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          />
          {/* Marketplace / Support stubs hidden */}
          <FooterRow
            label="Billing"
            hint="Soon"
            onClick={() => showToast("Billing is out of scope for this round")}
          />
          <FooterRow
            label="Sign out"
            hint={signedIn ? undefined : "未登录"}
            onClick={() => {
              setOpen(false);
              void (async () => {
                try {
                  await signOut();
                  showToast("已退出登录");
                  if (isTauri) {
                    try {
                      await openLoginWindow();
                      await hideMainWindow();
                    } catch {
                      /* keep main visible */
                    }
                  }
                } catch (err) {
                  showToast(err instanceof Error ? err.message : "退出失败");
                }
              })();
            }}
          />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-zinc-100 dark:hover:bg-white/8"
      >
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-white">
          P
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">You</span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="block truncate text-[11px] text-[var(--color-muted)]">{host}</span>
            {attentionTotal > 0 ? (
              <span className="shrink-0 rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">
                {attentionTotal > 99 ? "99+" : attentionTotal}
              </span>
            ) : null}
          </span>
        </span>
        <ChevronUp
          size={14}
          className={`text-[var(--color-muted)] transition ${open ? "" : "rotate-180"}`}
        />
      </button>
    </div>
  );
}

function FooterRow({
  label,
  hint,
  icon,
  onClick,
}: {
  label: string;
  hint?: string;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/8"
    >
      {icon ? <span className="text-zinc-500">{icon}</span> : <span className="w-3.5" />}
      <span className="flex-1">{label}</span>
      {hint ? <span className="text-[10px] text-[var(--color-muted)] capitalize">{hint}</span> : null}
    </button>
  );
}

function Section({ label, hide }: { label: string; hide?: boolean }) {
  if (hide) return null;
  return (
    <p className="px-2.5 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-[var(--color-muted)] uppercase">
      {label}
    </p>
  );
}

function RosterRow({
  active,
  title,
  emoji,
  id,
  preview,
  time,
  badge,
  badgeTone,
  status,
  pinned,
  onClick,
  onContextMenu,
  onMore,
}: {
  active: boolean;
  title: string;
  emoji: string;
  id: string;
  preview: string;
  time?: number;
  badge?: number;
  badgeTone?: "urgent" | "unread" | "done";
  status: "thinking" | "waiting" | "blocked" | "idle" | "done";
  pinned?: boolean;
  onClick: () => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  onMore: (event: ReactMouseEvent) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) {
      selectRailItem(rowRef.current);
    }
    wasActive.current = active;
  }, [active]);

  return (
    <div
      ref={rowRef}
      data-rail-active={active ? "1" : "0"}
      className="group pica-rail-row relative mb-0.5 flex min-h-[44px] w-full items-center gap-3 rounded-xl px-2.5 py-[10px] text-left"
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        onClick={() => {
          tapRailItem(rowRef.current);
          onClick();
        }}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span className="relative shrink-0">
          <Avatar id={id} name={title} emoji={emoji} size={36} alive />
          <StatusDot
            status={status}
            className="absolute -right-0.5 -bottom-0.5 ring-2 ring-[var(--color-surface)]"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1">
              {pinned ? <Pin size={11} className="shrink-0 text-[var(--color-muted)]" /> : null}
              <span className="truncate text-sm font-medium">{title}</span>
            </span>
            {time ? (
              <span className="shrink-0 text-[11px] text-[var(--color-muted)]">{formatTime(time)}</span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-[var(--color-muted)]">
            {status === "thinking"
              ? "Thinking…"
              : status === "waiting"
                ? "Waiting on you…"
                : status === "blocked"
                  ? "Blocked"
                  : preview}
          </span>
        </span>
        {badge ? (
          <span
            className={cn(
              "min-w-4 rounded-full px-1 text-center text-[10px] font-semibold text-white",
              badgeTone === "urgent"
                ? "bg-rose-500"
                : badgeTone === "unread"
                  ? "bg-sky-500"
                  : "bg-amber-500",
            )}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        title="Thread menu"
        aria-label="Thread menu"
        onClick={onMore}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-lg p-1 text-[var(--color-muted)] opacity-0 transition group-hover:opacity-100 hover:bg-zinc-200/80 focus:opacity-100 dark:hover:bg-white/10 motion-reduce:opacity-100"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}

function GroupRow({
  group,
  statuses,
  active,
  pinned,
  attention,
  onClick,
  onContextMenu,
  onMore,
}: {
  group: Group;
  statuses: Record<string, "thinking" | "waiting" | "blocked" | "idle" | "done">;
  active: boolean;
  pinned?: boolean;
  attention?: import("@/stores/attention").AttentionEntry;
  onClick: () => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  onMore: (event: ReactMouseEvent) => void;
}) {
  const thinking = group.members.filter((m) => statuses[m.botId] === "thinking");
  const attentionCount = attentionBadgeCount(attention);
  const badge = Math.max(group.unread ? 1 : 0, attentionCount);
  const urgent = attentionIsUrgent(attention) || group.unread;
  const rowRef = useRef<HTMLDivElement>(null);
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) {
      selectRailItem(rowRef.current);
    }
    wasActive.current = active;
  }, [active]);

  return (
    <div
      ref={rowRef}
      data-rail-active={active ? "1" : "0"}
      className="group pica-rail-row relative mb-0.5 flex min-h-[44px] w-full items-center gap-3 rounded-xl px-2.5 py-[10px] text-left"
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        onClick={() => {
          tapRailItem(rowRef.current);
          onClick();
        }}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900">
          <Users size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1">
              {pinned ? <Pin size={11} className="shrink-0 text-[var(--color-muted)]" /> : null}
              <span className="truncate text-sm font-medium">{group.name}</span>
            </span>
            {badge > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold text-white",
                  urgent ? "bg-rose-500" : "bg-sky-500",
                )}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-[var(--color-muted)]">
            {thinking.length > 1
              ? "Thinking together…"
              : thinking.length === 1
                ? "Thinking…"
                : group.preview?.trim() || `${group.members.length} members`}
          </span>
        </span>
      </button>
      <button
        type="button"
        title="Thread menu"
        aria-label="Thread menu"
        onClick={onMore}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-lg p-1 text-[var(--color-muted)] opacity-0 transition group-hover:opacity-100 hover:bg-zinc-200/80 focus:opacity-100 dark:hover:bg-white/10 motion-reduce:opacity-100"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}
