import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  FilePlus2,
  ListTodo,
  Mic,
  Paperclip,
  Plus,
  Search,
  Shield,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildMessageText,
  formatBytes,
  MAX_ATTACHMENTS,
  prepareAttachment,
  revokeAttachment,
  type PendingAttachment,
} from "@/lib/attachments";
import { clientNonce } from "@/lib/rakazoMap";
import {
  MODEL_PLACEHOLDERS,
  PERMISSION_OPTIONS,
  usePrefs,
  type PermissionMode,
} from "@/stores/prefs";
import { useConnection } from "@/stores/connection";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";
import {
  composerFocusPulse,
  composerSendPulse,
  enterChip,
  sendReadyPop,
  tapRailItem,
  tapSend,
} from "@/lib/motion";
import type { ModelCatalogEntry, SendMention } from "@/types/gateway";

type MenuId = "plus" | "perms" | "model" | null;

export type ComposerMember = { id: string; name: string; emoji?: string };

/**
 * BoardUI floating composer (~44px pill · 32px circles · 8px gap). Permissions stay local (no RPC).
 * Models come from models.list / models.role; attachments upload via artifacts.create
 * then threads.send({ artifactIds, mentions }) — Lulu-like send chain through workspace.
 */
export function Composer({
  threadId,
  busy,
  members,
}: {
  threadId: string;
  busy: boolean;
  /** Group members for @ picker (DM → omit / empty). */
  members?: ComposerMember[];
}) {
  const draft = useWorkspace((s) => s.composerDrafts[threadId] ?? "");
  const setDraft = useWorkspace((s) => s.setDraft);
  const reply = useWorkspace((s) => s.composerReplies[threadId] ?? null);
  const setReply = useWorkspace((s) => s.setReply);
  const send = useWorkspace((s) => s.send);
  const stop = useWorkspace((s) => s.stop);
  const composer = usePrefs((s) => s.composer);
  const setComposer = usePrefs((s) => s.setComposer);
  const showToast = useUi((s) => s.showToast);
  const [sending, setSending] = useState(false);
  const sendKey = usePrefs((s) => s.sendKey);
  const [menu, setMenu] = useState<MenuId>(null);
  const [modelQuery, setModelQuery] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  /** Cursor index of the `@` that opened the picker. */
  const mentionStartRef = useRef<number | null>(null);
  /** botId chips inserted via @ picker (name → id), for threads.send mentions. */
  const mentionIdsRef = useRef<Map<string, string>>(new Map());
  const client = useConnection((s) => s.client);
  const selection = useWorkspace((s) => s.selection);
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [defaultModelKey, setDefaultModelKey] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const narrow = useUi((s) => s.narrow);
  const barRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const narrowTextareaRef = useRef<HTMLTextAreaElement>(null);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const focusedRef = useRef(false);
  const wasCanSend = useRef(false);

  const mentionable = members && members.length > 0;

  // Clear attachment chips when switching threads.
  useEffect(() => {
    setAttachments((prev) => {
      prev.forEach(revokeAttachment);
      return [];
    });
    setMentionOpen(false);
    mentionStartRef.current = null;
    mentionIdsRef.current = new Map();
  }, [threadId]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const filteredMembers = useMemo(() => {
    if (!mentionable || !members) return [];
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
  }, [mentionable, members, mentionQuery]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery, mentionOpen]);

  useEffect(() => {
    if (!client) {
      setCatalog([]);
      setDefaultModelKey(null);
      return;
    }
    let cancelled = false;
    setModelsLoading(true);
    void (async () => {
      try {
        const [rows, role] = await Promise.all([
          client.listModels(),
          client.getModelRole("main").catch(() => null),
        ]);
        if (cancelled) return;
        const usable = rows.filter((m) => !m.placeholder && m.protocol !== "decisions");
        setCatalog(usable);
        const primary = role?.primary ?? role?.deploymentPrimary ?? null;
        const key = primary ? `${primary.provider}::${primary.modelId}` : null;
        setDefaultModelKey(key);
        if (key && (composer.modelId === "gateway-default" || !composer.modelId)) {
          setComposer({ modelId: key });
        }
      } catch {
        if (!cancelled) setCatalog([]);
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per client; prefs write is intentional
  }, [client]);

  const modelOptions = useMemo(() => {
    if (catalog.length === 0) return MODEL_PLACEHOLDERS;
    return catalog.map((m) => ({
      id: `${m.provider}::${m.id}`,
      label: m.label || m.id,
      group: m.providerName || m.provider,
      provider: m.provider,
      modelId: m.id,
    }));
  }, [catalog]);

  const models = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return modelOptions;
    return modelOptions.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        m.group.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q),
    );
  }, [modelQuery, modelOptions]);

  const modelLabel =
    modelOptions.find((m) => m.id === composer.modelId)?.label ??
    (defaultModelKey ? modelOptions.find((m) => m.id === defaultModelKey)?.label : null) ??
    (catalog.length ? "Model" : "Gateway default");
  const permLabel =
    PERMISSION_OPTIONS.find((p) => p.id === composer.permission)?.label ?? "Auto";

  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !sending && !busy;

  useEffect(() => {
    if (canSend && !wasCanSend.current) {
      sendReadyPop(sendBtnRef.current);
    }
    wasCanSend.current = canSend;
  }, [canSend]);

  // BoardUI composer keeps a tight single-line height until the draft wraps.
  useEffect(() => {
    for (const el of [textareaRef.current, narrowTextareaRef.current]) {
      if (!el) continue;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
    }
  }, [draft, narrow, threadId]);

  const setComposerFocused = (focused: boolean) => {
    if (focusedRef.current === focused) return;
    focusedRef.current = focused;
    composerFocusPulse(barRef.current, focused);
  };

  const addFiles = async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (files.length === 0) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      showToast(`Max ${MAX_ATTACHMENTS} attachments`);
      return;
    }
    const slice = files.slice(0, room);
    if (files.length > room) {
      showToast(`Only ${room} more file(s) allowed (max ${MAX_ATTACHMENTS})`);
    }
    const next: PendingAttachment[] = [];
    for (const file of slice) {
      const result = await prepareAttachment(file);
      if (!result.ok) {
        showToast(result.reason);
        continue;
      }
      next.push(result.item);
    }
    if (next.length) setAttachments((cur) => [...cur, ...next].slice(0, MAX_ATTACHMENTS));
  };

  const removeAttachment = (id: string) => {
    setAttachments((cur) => {
      const target = cur.find((a) => a.id === id);
      if (target) revokeAttachment(target);
      return cur.filter((a) => a.id !== id);
    });
  };

  const collectMentions = (text: string): SendMention[] => {
    const out: SendMention[] = [];
    const seen = new Set<string>();
    for (const [name, id] of mentionIdsRef.current) {
      if (!id || seen.has(id)) continue;
      if (text.includes(`@${name}`)) {
        seen.add(id);
        out.push({ kind: "bot", id });
      }
    }
    return out;
  };

  const submit = async () => {
    if (!canSend) return;
    const savedDraft = draft;
    const savedAttaches = attachments;
    const finalText = buildMessageText(draft, attachments);
    if (!finalText.trim() && savedAttaches.length === 0) return;
    if (!client || !selection) {
      showToast("Not connected — cannot send.");
      return;
    }

    tapSend(sendBtnRef.current);
    composerSendPulse(barRef.current);
    setSending(true);
    setAttachments([]);
    try {
      const artifactIds: string[] = [];
      const target =
        selection.kind === "dm"
          ? { botId: selection.botId }
          : { groupId: selection.groupId };
      for (const att of savedAttaches) {
        const created = await client.createArtifact(target, {
          name: att.name,
          mimeType: att.mime,
          contentBase64: att.contentBase64,
          clientNonce: clientNonce(),
        });
        if (created?.id) artifactIds.push(created.id);
      }
      const mentions = collectMentions(finalText);
      await send({
        text: finalText,
        ...(artifactIds.length ? { artifactIds } : {}),
        ...(mentions.length ? { mentions } : {}),
      });
      savedAttaches.forEach(revokeAttachment);
      mentionIdsRef.current = new Map(
        [...mentionIdsRef.current].filter(([name]) => finalText.includes(`@${name}`)),
      );
    } catch (err) {
      setDraft(threadId, savedDraft);
      setAttachments(savedAttaches);
      showToast(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const detectMention = (value: string, cursor: number) => {
    if (!mentionable) {
      setMentionOpen(false);
      mentionStartRef.current = null;
      return;
    }
    const before = value.slice(0, cursor);
    const match = before.match(/(?:^|[\s])@([^\s@]*)$/);
    if (!match) {
      setMentionOpen(false);
      mentionStartRef.current = null;
      return;
    }
    const atIndex = before.lastIndexOf("@");
    mentionStartRef.current = atIndex;
    setMentionQuery(match[1] ?? "");
    setMentionOpen(true);
  };

  const insertMention = (member: ComposerMember) => {
    const start = mentionStartRef.current;
    const el = textareaRef.current ?? narrowTextareaRef.current;
    if (start == null || !el) {
      setMentionOpen(false);
      return;
    }
    const cursor = el.selectionStart ?? draft.length;
    const before = draft.slice(0, start);
    const after = draft.slice(cursor);
    const insertion = `@${member.name} `;
    const next = before + insertion + after;
    mentionIdsRef.current.set(member.name, member.id);
    setDraft(threadId, next);
    setMentionOpen(false);
    mentionStartRef.current = null;
    requestAnimationFrame(() => {
      const pos = before.length + insertion.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && filteredMembers.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredMembers.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(filteredMembers[mentionIndex] ?? filteredMembers[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionOpen(false);
        mentionStartRef.current = null;
        return;
      }
    }
    if (event.key === "Escape" && reply) {
      event.preventDefault();
      setReply(threadId, null);
      return;
    }
    if (event.key === "Enter") {
      const mod = event.metaKey || event.ctrlKey;
      if (sendKey === "modEnter") {
        if (mod) {
          event.preventDefault();
          void submit();
        }
        // bare Enter → newline (default textarea)
        return;
      }
      // sendKey === "enter": Enter sends, Shift+Enter newline
      if (!event.shiftKey && !mod) {
        event.preventDefault();
        void submit();
      }
    }
  };

  const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setDraft(threadId, value);
    detectMention(value, event.target.selectionStart ?? value.length);
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;
    // Prefer image pastes; if only files, still attach.
    event.preventDefault();
    void addFiles(files);
  };

  const toggleMenu = (id: MenuId) => setMenu((cur) => (cur === id ? null : id));

  const setPermission = (id: PermissionMode) => {
    setComposer({
      permission: id,
      planMode:
        id === "plan"
          ? true
          : id === "auto" || id === "manual" || id === "bypass"
            ? false
            : composer.planMode,
    });
    setMenu(null);
  };

  const openFilePicker = () => {
    setMenu(null);
    fileInputRef.current?.click();
  };

  const expanded = narrow || Boolean(reply) || attachments.length > 0;

  return (
    <div className="pointer-events-none relative z-10 shrink-0 pt-0 pr-4 pb-4 pl-6 sm:pr-6 sm:pb-6 sm:pl-9">
      <div
        ref={barRef}
        className={`pica-composer-bar pointer-events-auto relative mx-auto flex max-w-3xl flex-col border bg-[var(--color-surface)] pe-2.5 ps-3 ${
          expanded ? "rounded-[26px] gap-1.5 pb-[9px] pt-3" : "min-h-11 justify-center rounded-[26px] gap-0 py-[9px]"
        } ${
          dragOver
            ? "border-[var(--color-line)]"
            : "border-[var(--color-line)]"
        } ${narrow ? "items-stretch" : ""}`}
        style={{ boxShadow: "var(--shadow-composer)" }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!barRef.current?.contains(e.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {reply ? (
          <ReplyChrome
            author={reply.author}
            preview={reply.preview}
            onDismiss={() => setReply(threadId, null)}
          />
        ) : null}

        {attachments.length > 0 ? (
          <div className="flex w-full flex-wrap gap-1.5 px-1 pb-0.5 pt-0.5">
            {attachments.map((att) => (
              <AttachmentChip key={att.id} att={att} onRemove={() => removeAttachment(att.id)} />
            ))}
          </div>
        ) : null}

        {narrow ? (
          <textarea
            ref={narrowTextareaRef}
            value={draft}
            rows={2}
            placeholder={composer.planMode ? "Plan a task…" : "Message"}
            onChange={onTextareaChange}
            onKeyDown={onTextareaKeyDown}
            onPaste={onPaste}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            className="max-h-36 min-h-5 w-full resize-none bg-transparent px-1.5 py-1 text-[14px] leading-5 outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-[var(--color-faint)]"
          />
        ) : null}
        <div className="pica-composer-controls flex w-full items-center gap-2">
          <ChromeIcon
            label="Add"
            active={menu === "plus" || composer.planMode}
            icon={menu === "plus" ? <X size={18} strokeWidth={2} /> : <Plus size={18} strokeWidth={2} />}
            onClick={() => toggleMenu("plus")}
          />
          <ChromeIcon
            label={`Permissions · ${permLabel}`}
            active={menu === "perms"}
            icon={<Shield size={18} strokeWidth={1.75} />}
            onClick={() => toggleMenu("perms")}
          />
          <ChromeIcon
            label={`Model · ${modelLabel}`}
            active={menu === "model"}
            icon={<Sparkles size={18} strokeWidth={1.75} />}
            onClick={() => {
              setModelQuery("");
              toggleMenu("model");
            }}
          />

          {narrow ? null : (
            <textarea
              ref={textareaRef}
              value={draft}
              rows={1}
              placeholder={composer.planMode ? "Plan a task…" : "Message"}
              onChange={onTextareaChange}
              onKeyDown={onTextareaKeyDown}
              onPaste={onPaste}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              className="max-h-36 min-h-5 flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-5 outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-[var(--color-faint)]"
            />
          )}

          {narrow ? <span className="min-w-0 flex-1" /> : null}

          <ChromeIcon label="Voice (soon)" icon={<Mic size={18} strokeWidth={1.75} />} disabled />

          {busy ? (
            <Button
              variant="outline"
              size="send"
              aria-label="Stop"
              className="rounded-full"
              onClick={() => void stop()}
            >
              <Square size={16} fill="currentColor" />
            </Button>
          ) : (
            <Button
              ref={sendBtnRef}
              variant="send"
              size="send"
              aria-label="Send"
              className="pica-send-disabled shrink-0"
              disabled={!canSend}
              onClick={() => void submit()}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 19V5M5 12l7-7 7 7"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Button>
          )}
        </div>

        {mentionOpen && mentionable ? (
          <MentionPopover
            members={filteredMembers}
            activeIndex={mentionIndex}
            onHover={setMentionIndex}
            onPick={insertMention}
            onClose={() => {
              setMentionOpen(false);
              mentionStartRef.current = null;
            }}
          />
        ) : null}

        {menu === "plus" ? (
          <Popover align="left">
            <MenuRow
              icon={<FilePlus2 size={14} />}
              label="Files"
              hint="Images embed · others noted"
              onClick={openFilePicker}
            />
            <MenuRow
              icon={<ListTodo size={14} />}
              label="Plan mode"
              hint={composer.planMode ? "On" : "Off"}
              checked={composer.planMode}
              onClick={() => {
                const next = !composer.planMode;
                setComposer({
                  planMode: next,
                  permission: next ? "plan" : composer.permission === "plan" ? "auto" : composer.permission,
                });
                setMenu(null);
              }}
            />
            <div className="my-1 border-t border-[var(--color-line)] dark:border-white/10" />
            <MenuRow icon={<X size={14} />} label="Close" onClick={() => setMenu(null)} />
          </Popover>
        ) : null}

        {menu === "perms" ? (
          <Popover align="left">
            <p className="px-2.5 pb-1 pt-1 text-[10px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
              Permissions
            </p>
            {PERMISSION_OPTIONS.map((opt) => (
              <MenuRow
                key={opt.id}
                label={opt.label}
                hint={opt.hint}
                checked={composer.permission === opt.id}
                onClick={() => setPermission(opt.id)}
              />
            ))}
            <p className="px-2.5 pb-2 pt-1 text-[10px] leading-relaxed text-[var(--color-muted)]">
              Local only — gateway has no permission mode yet.
            </p>
          </Popover>
        ) : null}

        {menu === "model" ? (
          <Popover align="left" wide>
            <p className="px-2.5 pb-1 pt-1 text-[10px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
              Model
            </p>
            <div className="mx-2 mb-2 flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-zinc-50 px-2 dark:border-white/10 dark:bg-white/5">
              <Search size={12} className="text-[var(--color-muted)]" />
              <input
                autoFocus
                value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)}
                placeholder="Search models"
                className="h-8 flex-1 bg-transparent text-xs outline-none"
              />
            </div>
            <div className="pica-scroll max-h-52 overflow-auto">
              {models.length === 0 ? (
                <p className="px-2.5 py-3 text-xs text-[var(--color-muted)]">No matches</p>
              ) : (
                models.map((m) => (
                  <MenuRow
                    key={m.id}
                    label={m.label}
                    hint={m.group}
                    checked={composer.modelId === m.id}
                    onClick={() => {
                      setComposer({ modelId: m.id });
                      setMenu(null);
                    }}
                  />
                ))
              )}
            </div>
            <p className="px-2.5 pb-2 pt-1 text-[10px] leading-relaxed text-[var(--color-muted)]">
              {catalog.length
                ? "From models.list · default from models.role(main). Composer pick is local until bots.update model fields are wired per-thread."
                : modelsLoading
                  ? "Loading models…"
                  : "Server catalog empty — showing local placeholders."}
            </p>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}

function ReplyChrome({
  author,
  preview,
  onDismiss,
}: {
  author: string;
  preview: string;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    enterChip(ref.current);
  }, []);
  return (
    <div
      ref={ref}
      className="flex w-full items-start gap-2 rounded-xl bg-zinc-100/80 px-2.5 py-2 dark:bg-white/5"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-[var(--color-muted)]">{author}</p>
        <p className="truncate text-[13px] text-[var(--color-ink)]">{preview}</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss reply"
        title="Dismiss reply"
        className="pica-focus-ring inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-zinc-200/70 hover:text-[var(--color-ink)] dark:hover:bg-white/10"
        onClick={onDismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function AttachmentChip({
  att,
  onRemove,
}: {
  att: PendingAttachment;
  onRemove: () => void;
}) {
  const chipRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    enterChip(chipRef.current);
  }, []);
  return (
    <span
      ref={chipRef}
      className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-xl border border-[var(--color-line)] bg-zinc-50 py-1 pr-1 pl-1 dark:border-white/10 dark:bg-white/5"
    >
      {att.kind === "image" && att.previewUrl ? (
        <img
          src={att.previewUrl}
          alt=""
          className="size-7 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-200/80 text-zinc-500 dark:bg-white/10">
          <Paperclip size={12} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-medium text-zinc-800 dark:text-zinc-100">
          {att.name}
        </span>
        <span className="block text-[9px] text-[var(--color-muted)]">{formatBytes(att.size)}</span>
      </span>
      <button
        type="button"
        aria-label={`Remove ${att.name}`}
        onClick={onRemove}
        className="pica-focus-ring inline-flex size-5 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-100"
      >
        <X size={11} />
      </button>
    </span>
  );
}

function MentionPopover({
  members,
  activeIndex,
  onHover,
  onPick,
  onClose,
}: {
  members: ComposerMember[];
  activeIndex: number;
  onHover: (i: number) => void;
  onPick: (m: ComposerMember) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="listbox"
      aria-label="Mention member"
      className="absolute bottom-[calc(100%+8px)] left-2 z-30 w-56 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] py-1.5 shadow-[var(--shadow-soft)] dark:bg-zinc-900"
    >
      <p className="px-2.5 pb-1 pt-1 text-[10px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
        Mention
      </p>
      {members.length === 0 ? (
        <p className="px-2.5 py-2 text-xs text-[var(--color-muted)]">No members match</p>
      ) : (
        members.map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            data-member-id={m.id}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(m)}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm ${
              i === activeIndex
                ? "bg-zinc-100 dark:bg-white/10"
                : "hover:bg-zinc-100 dark:hover:bg-white/8"
            }`}
          >
            <span className="text-base leading-none">{m.emoji || "🤖"}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-800 dark:text-zinc-100">
              {m.name}
            </span>
          </button>
        ))
      )}
      <p className="px-2.5 pb-1.5 pt-1 text-[10px] leading-relaxed text-[var(--color-muted)]">
        @ is a cue in the text — gateway still notifies the whole group.
      </p>
    </div>
  );
}

function ChromeIcon({
  label,
  icon,
  onClick,
  active,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={btnRef}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        tapRailItem(btnRef.current);
        onClick?.();
      }}
      className={`pica-focus-ring inline-flex size-8 shrink-0 items-center justify-center rounded-full transition duration-150 ${
        disabled
          ? "cursor-not-allowed text-zinc-300 opacity-60 dark:text-zinc-600"
          : active
            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/90 hover:text-zinc-800 dark:bg-white/8 dark:text-zinc-300 dark:hover:bg-white/12 dark:hover:text-zinc-100"
      }`}
    >
      {icon}
    </button>
  );
}

function Popover({
  children,
  align,
  wide,
}: {
  children: React.ReactNode;
  align: "left" | "right";
  wide?: boolean;
}) {
  return (
    <div
      role="menu"
      className={`absolute bottom-[calc(100%+8px)] z-20 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] py-1.5 shadow-[var(--shadow-soft)] dark:bg-zinc-900 ${
        align === "left" ? "left-2" : "right-2"
      } ${wide ? "w-64" : "w-56"}`}
    >
      {children}
    </div>
  );
}

function MenuRow({
  label,
  hint,
  icon,
  checked,
  onClick,
}: {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  checked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="pica-focus-ring flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/8"
    >
      {icon ? <span className="text-zinc-500">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-zinc-800 dark:text-zinc-100">{label}</span>
        {hint ? (
          <span className="block truncate text-[10px] text-[var(--color-muted)]">{hint}</span>
        ) : null}
      </span>
      {checked ? <Check size={14} className="shrink-0 text-[var(--color-accent)]" /> : null}
    </button>
  );
}
