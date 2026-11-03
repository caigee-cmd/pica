import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Copy, Menu, MoreHorizontal, Monitor, PanelRight, PanelRightClose, Phone, Reply, ThumbsDown, ThumbsUp, Timer, Users, UserRound } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { StatusDot, statusLabel } from "@/components/StatusDot";
import {
  arcIntoThinking,
  enterMessageRow,
  enterThreadSwitch,
  flashHighlight,
  pulseThinkingLabel,
} from "@/lib/motion";
import { formatTime } from "@/lib/utils";
import { Composer } from "@/modules/chat/Composer";
import { MessageBody } from "@/modules/chat/MessageBody";
import { useLocalChrome } from "@/stores/localChrome";
import { usePrefs } from "@/stores/prefs";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";
import type { Bot, Message } from "@/types/gateway";

const NO_MESSAGES: Message[] = [];

export function ThreadView() {
  const selection = useWorkspace((s) => s.selection);
  const bots = useWorkspace((s) => s.bots);
  const groups = useWorkspace((s) => s.groups);
  const threadId = selection?.threadId;
  const messages = useWorkspace((s) =>
    threadId ? (s.messages[threadId] ?? NO_MESSAGES) : NO_MESSAGES,
  );
  const loading = useWorkspace((s) => s.loadingThread);
  const statuses = useWorkspace((s) => s.statuses);
  const streamingIds = useWorkspace((s) => s.streamingIds);
  const finishStreaming = useWorkspace((s) => s.finishStreaming);
  const setPanel = useWorkspace((s) => s.setPanel);
  const panel = useWorkspace((s) => s.panel);
  const agentLooks = usePrefs((s) => s.agents);
  const narrow = useUi((s) => s.narrow);
  const setRailOpen = useUi((s) => s.setRailOpen);
  const setEditorOpen = useUi((s) => s.setEditorOpen);
  const editorOpen = useUi((s) => s.editorOpen);
  const showToast = useUi((s) => s.showToast);
  const clearThreadHistory = useWorkspace((s) => s.clearThreadHistory);
  const markThreadUnread = useWorkspace((s) => s.markThreadUnread);
  const [kebabOpen, setKebabOpen] = useState(false);
  const kebabRef = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const thinkingLabelRef = useRef<HTMLSpanElement>(null);
  const [arcReady, setArcReady] = useState(false);
  const lastArcKey = useRef<string>("");
  const threadBodyRef = useRef<HTMLDivElement>(null);
  const prevThreadId = useRef<string | undefined>(undefined);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, selection?.threadId, streamingIds.length]);

  const pendingFocusMessageId = useUi((s) => s.pendingFocusMessageId);
  const setPendingFocusMessageId = useUi((s) => s.setPendingFocusMessageId);
  useEffect(() => {
    if (!pendingFocusMessageId || messages.length === 0) return;
    if (loading === selection?.threadId) return;
    const id = pendingFocusMessageId;
    const el = document.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(id)}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    flashHighlight(el);
    setPendingFocusMessageId(null);
  }, [
    pendingFocusMessageId,
    loading,
    messages.length,
    selection?.threadId,
    setPendingFocusMessageId,
  ]);

  useEffect(() => {
    if (!kebabOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!kebabRef.current?.contains(event.target as Node)) setKebabOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setKebabOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [kebabOpen]);

  const bot =
    selection?.kind === "dm" ? bots.find((item) => item.id === selection.botId) : undefined;
  const group =
    selection?.kind === "group"
      ? groups.find((item) => item.id === selection.groupId)
      : undefined;

  const title = (bot ? agentLooks[bot.id]?.name || bot.name : null) ?? group?.name ?? "Pica";

  const thinkingBots = useMemo(() => {
    if (!selection) return [] as Bot[];
    const ids =
      selection.kind === "dm"
        ? [selection.botId]
        : (group?.members.map((m) => m.botId) ?? []);
    return ids
      .filter((id) => (statuses[id] ?? "idle") === "thinking")
      .map((id) => bots.find((b) => b.id === id))
      .filter((b): b is Bot => Boolean(b));
  }, [selection, group, statuses, bots]);

  const busy = thinkingBots.length > 0;

  const subtitle = bot
    ? statusLabel(statuses[bot.id] ?? "idle")
    : group
      ? busy
        ? thinkingBots.length > 1
          ? "Thinking together…"
          : `${thinkingBots[0]?.name ?? "Agent"} is thinking…`
        : `${group.members.length} members`
      : "";

  const memberBots = useMemo(() => {
    if (bot) return [bot];
    if (!group) return [];
    return group.members
      .map((m) => bots.find((b) => b.id === m.botId))
      .filter((b): b is Bot => Boolean(b));
  }, [bot, group, bots]);

  // Only the head of the typewriter queue plays — one agent at a time.
  const activeStreamId = useMemo(() => {
    for (const id of streamingIds) {
      const msg = messages.find((m) => m.id === id);
      if (msg && msg.sender !== "user" && msg.kind === "text") return id;
    }
    return null;
  }, [streamingIds, messages]);

  // Arc header → thinking row when gateway marks bots thinking.
  useEffect(() => {
    if (!busy || !selection) {
      lastArcKey.current = "";
      setArcReady(false);
      return;
    }
    const key = `${selection.threadId}:${thinkingBots.map((b) => b.id).join(",")}`;
    if (key === lastArcKey.current) return;

    // Wait a frame so Thinking row slots exist in the DOM.
    let cleanup: (() => void) | undefined;
    const raf = requestAnimationFrame(() => {
      const root = sectionRef.current;
      if (!root) return;
      const specs = thinkingBots.flatMap((b) => {
        const fromEl = root.querySelector<HTMLElement>(
          `[data-avatar-source="header"][data-bot-id="${CSS.escape(b.id)}"]`,
        );
        const toEl = root.querySelector<HTMLElement>(
          `[data-avatar-slot="thinking"][data-bot-id="${CSS.escape(b.id)}"]`,
        );
        return fromEl && toEl ? [{ botId: b.id, fromEl, toEl }] : [];
      });
      if (specs.length === 0) {
        setArcReady(true);
        lastArcKey.current = key;
        return;
      }
      lastArcKey.current = key;
      setArcReady(false);
      cleanup = arcIntoThinking(specs, () => setArcReady(true));
    });

    return () => {
      cancelAnimationFrame(raf);
      cleanup?.();
    };
  }, [busy, thinkingBots, selection]);

  useEffect(() => {
    if (!busy) return;
    return pulseThinkingLabel(thinkingLabelRef.current).kill;
  }, [busy]);

  // Reset arc bookkeeping when leaving the thread.
  useEffect(() => {
    lastArcKey.current = "";
    setArcReady(false);
  }, [selection?.threadId]);

  // Soft cross-fade when switching chats (BoardUI rail → thread feel).
  useEffect(() => {
    const id = selection?.threadId;
    if (!id) {
      prevThreadId.current = undefined;
      return;
    }
    if (prevThreadId.current && prevThreadId.current !== id) {
      enterThreadSwitch(threadBodyRef.current);
    }
    prevThreadId.current = id;
  }, [selection?.threadId]);

  if (!selection) {
    const sample = bots.slice(0, 4);
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-thread)]">
        <EmptyState
          title="A few minds. One conversation."
          subtitle="Pick a teammate from the rail, or start a multi-agent chat from +."
          bots={sample.length >= 2 ? sample : undefined}
          actions={
            <>
              {narrow ? (
                <button
                  type="button"
                  className="rounded-full border border-[var(--color-line)] px-3.5 py-2 text-xs font-medium dark:border-white/12"
                  onClick={() => setRailOpen(true)}
                >
                  Open sidebar
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-full bg-[var(--color-accent)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm"
                onClick={() => useUi.getState().setGroupPickerOpen(true)}
              >
                New group chat
              </button>
            </>
          }
        />
      </div>
    );
  }


  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-hidden bg-[var(--color-thread)]"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[color-mix(in_srgb,var(--color-line)_75%,transparent)] bg-[var(--color-thread)] py-[13px] pr-3 pl-5 dark:border-white/10 sm:gap-3 sm:pr-5 sm:pl-8 md:px-[22px]">
        {narrow ? (
          <HeaderIconButton
            label="Open sidebar"
            icon={<Menu size={16} />}
            onClick={() => setRailOpen(true)}
          />
        ) : null}

        <button
          type="button"
          className={`pica-header-cluster flex items-center text-left ${
            narrow
              ? "rounded-full border border-[var(--color-line)] bg-zinc-50 py-1 pr-3 pl-1 dark:border-white/10 dark:bg-white/5"
              : "rounded-xl hover:bg-zinc-50 dark:hover:bg-white/5"
          }`}
          data-cluster="header"
          data-testid="group-settings-trigger"
          aria-expanded={editorOpen && panel === "none"}
          title={selection?.kind === "group" ? "Group settings" : "Agent settings"}
          onClick={() => {
            setPanel("none");
            setEditorOpen(true);
          }}
        >
          {memberBots.length === 0 ? null : memberBots.length === 1 ? (
            <Avatar
              id={memberBots[0].id}
              name={agentLooks[memberBots[0].id]?.name || memberBots[0].name}
              emoji={memberBots[0].emoji}
              size={narrow ? 30 : 36}
              alive
              data-avatar-source="header"
            />
          ) : (
            <div className="flex items-center pl-1">
              {memberBots.slice(0, 4).map((m, i) => (
                <span
                  key={m.id}
                  className="relative -ml-2.5 first:ml-0 rounded-full ring-2 ring-[var(--color-thread)]"
                  style={{ zIndex: 10 - i }}
                >
                  <Avatar
                    id={m.id}
                    name={agentLooks[m.id]?.name || m.name}
                    emoji={m.emoji}
                    size={narrow ? 26 : 28}
                    alive
                    data-avatar-source="header"
                  />
                </span>
              ))}
              {memberBots.length > 4 ? (
                <span className="relative -ml-2.5 inline-flex size-7 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-medium text-zinc-600 ring-2 ring-[var(--color-thread)] dark:bg-zinc-800 dark:text-zinc-300">
                  +{memberBots.length - 4}
                </span>
              ) : null}
            </div>
          )}
          {narrow ? (
            <span className="ml-2 max-w-[9rem] truncate text-xs font-semibold">{title}</span>
          ) : null}
        </button>

        {narrow ? null : (
          <button
            type="button"
            className="min-w-0 flex-1 rounded-xl px-1.5 py-0.5 text-left hover:bg-zinc-50 dark:hover:bg-white/5"
            data-testid="group-settings-trigger-title"
            title={selection?.kind === "group" ? "Group settings" : "Agent settings"}
            onClick={() => {
              setPanel("none");
              setEditorOpen(true);
            }}
          >
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold">{title}</h2>
              {bot ? <StatusDot status={statuses[bot.id] ?? "idle"} /> : null}
            </div>
            <p className="truncate text-xs text-[var(--color-muted)]">
              {bot?.role && !busy ? `${bot.role} · ${subtitle}` : subtitle}
            </p>
          </button>
        )}

        {narrow ? <div className="min-w-0 flex-1" /> : null}

        <div className="relative flex items-center gap-0.5" ref={kebabRef}>
          {bot && !narrow ? (
            <>
              <HeaderButton
                label="Screen"
                active={panel === "computer"}
                onClick={() => {
                  if (panel === "computer") {
                    setPanel("none");
                  } else {
                    setPanel("computer");
                    setEditorOpen(true);
                  }
                }}
                icon={<Monitor size={14} />}
              />
              <HeaderButton
                label="Routines"
                active={panel === "routines"}
                onClick={() => {
                  if (panel === "routines") {
                    setPanel("none");
                  } else {
                    setPanel("routines");
                    setEditorOpen(true);
                  }
                }}
                icon={<Timer size={14} />}
              />
              {selection?.kind === "dm" ? (
                <HeaderButton
                  label="Call"
                  active={panel === "call"}
                  onClick={() => {
                    if (panel === "call") {
                      setPanel("none");
                    } else {
                      setPanel("call");
                      setEditorOpen(true);
                    }
                  }}
                  icon={<Phone size={14} />}
                />
              ) : null}
            </>
          ) : null}
          {!narrow ? (
            <HeaderIconButton
              label={
                selection?.kind === "group"
                  ? editorOpen
                    ? "Hide group settings (⌘\\)"
                    : "Group settings (⌘\\)"
                  : editorOpen
                    ? "Hide agent panel (⌘\\)"
                    : "Show agent panel (⌘\\)"
              }
              icon={editorOpen ? <PanelRightClose size={15} /> : <PanelRight size={15} />}
              onClick={() => {
                setPanel("none");
                setEditorOpen(!editorOpen);
              }}
            />
          ) : null}
          {narrow ? (
            <HeaderIconButton
              label={selection?.kind === "group" ? "Group settings" : "Agent editor"}
              icon={<PanelRight size={15} />}
              onClick={() => {
                setPanel("none");
                setEditorOpen(!editorOpen);
              }}
            />
          ) : null}
          <HeaderIconButton
            label="Copy conversation id"
            icon={<Copy size={14} />}
            onClick={() => {
              const id = selection?.threadId ?? "";
              const payload = id ? `pica://thread/${id}` : "";
              if (!payload) {
                showToast("No conversation selected");
                return;
              }
              void navigator.clipboard.writeText(payload).then(
                () => showToast("Copied conversation link"),
                () => showToast("Clipboard unavailable"),
              );
            }}
          />
          <HeaderIconButton
            label="More"
            icon={<MoreHorizontal size={14} />}
            onClick={() => setKebabOpen((v) => !v)}
          />
          {kebabOpen ? (
            <div
              role="menu"
              className="absolute top-[calc(100%+6px)] right-0 z-20 w-48 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-soft)]"
            >
              {selection?.kind === "group" ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/8"
                  onClick={() => {
                    setKebabOpen(false);
                    setPanel("none");
                    setEditorOpen(true);
                  }}
                >
                  <Users size={14} className="text-zinc-500" />
                  Group settings
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/8"
                  onClick={() => {
                    setKebabOpen(false);
                    setPanel("none");
                    setEditorOpen(true);
                  }}
                >
                  <UserRound size={14} className="text-zinc-500" />
                  Edit agent
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/8"
                onClick={() => {
                  setKebabOpen(false);
                  useUi.getState().setGroupPickerOpen(true);
                }}
              >
                <Users size={14} className="text-zinc-500" />
                Start group
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/8"
                onClick={() => {
                  setKebabOpen(false);
                  void markThreadUnread().then(
                    () => showToast("Marked unread"),
                    (err) => showToast(err instanceof Error ? err.message : "Mark unread failed"),
                  );
                }}
              >
                Mark unread
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-zinc-100 dark:text-red-400 dark:hover:bg-white/8"
                onClick={() => {
                  setKebabOpen(false);
                  if (!window.confirm("Clear this conversation on the gateway?")) return;
                  void clearThreadHistory().then(
                    () => showToast("Conversation cleared"),
                    (err) => showToast(err instanceof Error ? err.message : "Clear failed"),
                  );
                }}
              >
                Clear conversation
              </button>
              {bot && narrow ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/8"
                    onClick={() => {
                      setKebabOpen(false);
                      setPanel("computer");
                      setEditorOpen(true);
                    }}
                  >
                    <Monitor size={14} className="text-zinc-500" />
                    Screen
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/8"
                    onClick={() => {
                      setKebabOpen(false);
                      setPanel("routines");
                      setEditorOpen(true);
                    }}
                  >
                    <Timer size={14} className="text-zinc-500" />
                    Routines
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/8"
                    onClick={() => {
                      setKebabOpen(false);
                      setPanel("call");
                      setEditorOpen(true);
                    }}
                  >
                    <Phone size={14} className="text-zinc-500" />
                    Call
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div
        ref={threadBodyRef}
        className="pica-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto pt-3 pr-4 pb-2 pl-6 sm:pr-6 sm:pl-9"
      >
        <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end gap-3">
        {loading === selection.threadId && messages.length === 0 ? (
          <div className="grid min-h-[12rem] place-items-center py-10">
            <div className="flex flex-col items-center gap-3" role="status" aria-label="Loading…">
              <span className="pica-loading-delay inline-block size-5 rounded-full border-2 border-[var(--color-muted)] border-t-transparent" />
              <p className="pica-loading-label text-xs text-[var(--color-muted)]">Loading conversation…</p>
            </div>
          </div>
        ) : null}

        {!loading && messages.length === 0 && !busy ? (
          bot ? (
            <EmptyState
              compact
              title={`Say hello to ${agentLooks[bot.id]?.name || bot.name}`}
              subtitle="Messages stay on the gateway · start typing below."
              bots={[bot]}
              name={agentLooks[bot.id]?.name || bot.name}
            />
          ) : (
            <EmptyState
              compact
              title="A few minds. One conversation."
              subtitle="Messages stay on the gateway · start typing below."
              bots={memberBots}
            />
          )
        ) : null}

        {messages.length > 0 ? <TodayChip /> : null}

        {messages.map((message) => (
          <Bubble
            key={message.id}
            message={message}
            bots={bots}
            streaming={activeStreamId === message.id}
            onStreamDone={() => finishStreaming(message.id)}
            highlightMentions={selection.kind === "group"}
            allMessages={messages}
          />
        ))}

        {busy ? (
          <div
            className="pica-thinking-row flex items-center gap-2.5 px-1 py-1 text-xs text-[var(--color-muted)]"
            data-arc-ready={arcReady ? "1" : "0"}
          >
            <span className="inline-flex items-center gap-1">
              {thinkingBots.map((m) => (
                <Avatar
                  key={m.id}
                  id={m.id}
                  name={m.name}
                  emoji={m.emoji}
                  size={22}
                  alive
                  data-avatar-slot="thinking"
                  className={arcReady ? "opacity-100" : "opacity-0"}
                />
              ))}
            </span>
            <span ref={thinkingLabelRef}>
              {thinkingBots.length > 1 ? "Thinking together…" : "Thinking…"}
            </span>
          </div>
        ) : null}
        <div ref={bottom} />
        </div>
      </div>

      <Composer
        threadId={selection.threadId}
        busy={busy}
        members={
          selection.kind === "group"
            ? memberBots.map((b) => ({
                id: b.id,
                name: agentLooks[b.id]?.name || b.name,
                emoji: b.emoji,
              }))
            : undefined
        }
      />
    </section>
  );
}

function TodayChip() {
  return (
    <h3 className="my-3 select-none text-center text-xs font-normal text-[var(--color-muted)]">
      Today
    </h3>
  );
}

function HeaderIconButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="pica-focus-ring inline-flex size-8 items-center justify-center rounded-xl text-[var(--color-muted)] transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/8 dark:hover:text-zinc-100"
    >
      {icon}
    </button>
  );
}

function HeaderButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pica-focus-ring inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-white"
          : "text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-white/8"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function replyLabel(message: Message): string {
  const quote = message.replyQuote?.trim();
  if (quote) return quote.replace(/\s+/gu, " ").slice(0, 120);
  const text = message.replyPreview?.text?.trim();
  if (text) return text.replace(/\s+/gu, " ").slice(0, 120);
  if (message.replyPreview?.attachment?.kind === "image") return "Photo";
  if (message.replyPreview?.attachment) return "Attachment";
  return "Message";
}

function ReplyLine({
  message,
  bots,
  mine,
  onJump,
}: {
  message: Message;
  bots: Bot[];
  mine: boolean;
  onJump: (id: string) => void;
}) {
  if (!message.replyToMessageId && message.replyQuote == null) return null;
  const unavailable = message.replyPreview === null || !message.replyToMessageId;
  if (unavailable) {
    return (
      <div
        className={`mb-1 truncate text-xs text-[var(--color-muted)] ${mine ? "text-end" : ""}`}
      >
        Original message unavailable
      </div>
    );
  }
  const parent = message.replyPreview;
  let author = "You";
  if (parent?.role === "bot" || parent?.botId) {
    const bot = bots.find((b) => b.id === (parent.botId ?? ""));
    author = bot?.name || parent?.botId || "Agent";
  } else if (parent?.role === "system") {
    author = "System";
  }
  const text = replyLabel(message);
  return (
    <div className={`flex ${mine ? "justify-end" : ""}`}>
      <button
        type="button"
        aria-label={`Jump to replied message: ${text}`}
        onClick={() => {
          if (message.replyToMessageId) onJump(message.replyToMessageId);
        }}
        className="mb-1 flex min-w-0 max-w-full items-center gap-1 text-start text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <span aria-hidden="true">↩ </span>
        <span className="min-w-0 truncate">
          {author}: {text}
        </span>
      </button>
    </div>
  );
}

function Bubble({
  message,
  bots,
  streaming,
  onStreamDone,
  highlightMentions,
  allMessages,
}: {
  message: Message;
  bots: Bot[];
  streaming: boolean;
  onStreamDone: () => void;
  highlightMentions?: boolean;
  allMessages: Message[];
}) {
  const mine = message.sender === "user";
  const bot = bots.find((item) => item.id === message.sender);
  const lookName = usePrefs((s) => s.agents[message.sender]?.name);
  const name = mine ? "You" : (lookName || bot?.name || message.sender);
  const handleDone = useCallback(() => onStreamDone(), [onStreamDone]);
  const threadId = useWorkspace((s) => s.selection?.threadId ?? "");
  const setReply = useWorkspace((s) => s.setReply);
  const showToast = useUi((s) => s.showToast);
  const thumb = useLocalChrome((s) => s.thumbs[`${threadId}:${message.id}`] ?? null);
  const setThumb = useLocalChrome((s) => s.setThumb);
  const reactToMessage = useWorkspace((s) => s.reactToMessage);
  const rowRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    enterMessageRow(rowRef.current, { mine });
  }, [message.id, mine]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const copyText = async () => {
    const text = message.content?.trim() || JSON.stringify(message.payload ?? {}, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied");
    } catch {
      showToast("Copy failed");
    }
  };

  const startReply = () => {
    if (!threadId) return;
    const preview =
      message.content?.trim().replace(/\s+/gu, " ").slice(0, 200) ||
      (message.kind !== "text" ? message.kind : "Message");
    setReply(threadId, {
      messageId: message.id,
      author: name,
      preview,
    });
    showToast(`Replying to ${name}`);
  };

  const jumpTo = (id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    flashHighlight(el ?? null);
  };

  // Prefer live parent text when replyPreview omitted but parent is in transcript.
  const enriched: Message =
    message.replyToMessageId && message.replyPreview === undefined
      ? (() => {
          const parent = allMessages.find((m) => m.id === message.replyToMessageId);
          if (!parent) return message;
          return {
            ...message,
            replyPreview: {
              role: parent.sender === "user" ? "user" : "bot",
              botId: parent.sender === "user" ? undefined : parent.sender,
              text: parent.content?.trim() || parent.kind,
            },
          };
        })()
      : message;

  return (
    <div
      ref={rowRef}
      data-message-id={message.id}
      className={`group/bubble pica-msg-row flex gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}
    >
      {mine ? null : (
        <Avatar id={message.sender} name={name} emoji={bot?.emoji} size={22} alive={streaming} />
      )}
      <div
        className={`relative flex flex-col gap-0 ${
          mine
            ? "items-end max-w-[min(84%,calc(100%-2rem),39rem)]"
            : "max-w-[min(88%,calc(100%-2rem),39rem)]"
        }`}
      >
        {!mine ? (
          <div className="mb-1 flex items-baseline gap-2 text-[11px] text-[var(--color-muted)]">
            <span className="font-medium text-[var(--color-ink)]/80">{name}</span>
            <span className="text-[var(--color-faint)]">{formatTime(message.created_at)}</span>
          </div>
        ) : null}
        <ReplyLine message={enriched} bots={bots} mine={mine} onJump={jumpTo} />
        <div
          className={`pica-bubble relative max-w-full rounded-[20px] px-[18px] py-3 text-[14.5px] leading-[1.45] ${
            mine
              ? "pica-bubble-user bg-[var(--color-bubble-user)] text-[var(--color-bubble-user-fg)]"
              : "pica-bubble-agent bg-[var(--color-bubble-agent)] text-[var(--color-ink)]"
          }`}
        >
          <MessageBody
            message={message}
            streaming={streaming && message.kind === "text"}
            onStreamDone={handleDone}
            highlightMentions={highlightMentions}
          />
          <div
            className="pica-bubble-actions pointer-events-none absolute right-0 -top-3 z-10 flex items-center gap-0.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]/95 p-0.5 shadow-sm opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover/bubble:pointer-events-auto group-hover/bubble:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 motion-reduce:duration-0"
          >
            <div className="relative">
              <BubbleAction
                label="更多"
                compact
                active={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
              >
                <MoreHorizontal size={11} />
              </BubbleAction>
              {moreOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-1 min-w-[7.5rem] overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] py-0.5 shadow-[var(--shadow-soft)]"
                >
                  <BubbleMenuItem
                    label="复制"
                    onClick={() => {
                      setMoreOpen(false);
                      void copyText();
                    }}
                  >
                    <Copy size={12} />
                  </BubbleMenuItem>
                  <BubbleMenuItem
                    label="赞"
                    active={thumb === "up"}
                    onClick={() => {
                      const next = thumb === "up" ? null : "up";
                      setThumb(threadId, message.id, next);
                      setMoreOpen(false);
                      if (next === "up") {
                        void reactToMessage(message.id, "👍").catch((err) =>
                          showToast(err instanceof Error ? err.message : "React failed"),
                        );
                      }
                    }}
                  >
                    <ThumbsUp size={12} />
                  </BubbleMenuItem>
                  <BubbleMenuItem
                    label="踩"
                    active={thumb === "down"}
                    onClick={() => {
                      const next = thumb === "down" ? null : "down";
                      setThumb(threadId, message.id, next);
                      setMoreOpen(false);
                      if (next === "down") {
                        void reactToMessage(message.id, "👎").catch((err) =>
                          showToast(err instanceof Error ? err.message : "React failed"),
                        );
                      }
                    }}
                  >
                    <ThumbsDown size={12} />
                  </BubbleMenuItem>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              title="回复"
              aria-label="回复"
              onClick={startReply}
              className="inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              <Reply size={11} />
              回复
            </button>
          </div>
        </div>
        {mine ? (
          <div className="mt-1 text-right text-[11px] text-[var(--color-faint)]">
            {formatTime(message.created_at)}
          </div>
        ) : null}
        {thumb ? (
          <p className={`mt-1 text-[10px] text-[var(--color-muted)] ${mine ? "text-right" : ""}`}>
            Marked {thumb === "up" ? "helpful" : "not helpful"}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BubbleAction({
  label,
  onClick,
  children,
  active,
  compact,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-md transition hover:bg-zinc-100 dark:hover:bg-white/10 ${
        compact ? "size-6" : "size-7"
      } ${active ? "text-[var(--color-ink)]" : "text-zinc-600 dark:text-zinc-300"}`}
    >
      {children}
    </button>
  );
}

function BubbleMenuItem({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={label}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition hover:bg-zinc-100 dark:hover:bg-white/8 ${
        active ? "text-[var(--color-accent)]" : "text-[var(--color-ink)]"
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
