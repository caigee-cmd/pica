import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { closeRightPanel } from "@/components/SidePanelChrome";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { enterEditorRail } from "@/lib/motion";
import { usePrefs } from "@/stores/prefs";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";
import type { Bot, Group } from "@/types/gateway";

/** Matches @rakazo/contracts GROUP_* — multi-bot shared thread, not an IM room. */
const GROUP_MEMBER_MIN = 2;
const GROUP_MEMBER_MAX = 10;
const GROUP_NAME_MAX_LENGTH = 80;

function sameMembers(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
}

function validSelection(name: string, selected: readonly string[]) {
  return (
    Boolean(name.trim()) &&
    selected.length >= GROUP_MEMBER_MIN &&
    selected.length <= GROUP_MEMBER_MAX
  );
}

function MemberPicker({
  bots,
  selected,
  onChange,
  onOpenBot,
}: {
  bots: Bot[];
  selected: string[];
  onChange: (selected: string[]) => void;
  onOpenBot?: (botId: string) => void;
}) {
  const agentLooks = usePrefs((s) => s.agents);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [everPicked, setEverPicked] = useState<ReadonlySet<string>>(() => new Set(selected));

  const needle = expanded ? query.trim().toLowerCase() : "";
  const visible = useMemo(() => {
    const base = expanded ? bots : bots.filter((bot) => everPicked.has(bot.id));
    if (!needle) return base;
    return base.filter((bot) => {
      const label = agentLooks[bot.id]?.name || bot.name;
      return label.toLowerCase().includes(needle) || bot.name.toLowerCase().includes(needle);
    });
  }, [expanded, bots, everPicked, needle, agentLooks]);

  const toggle = (botId: string) => {
    if (selected.includes(botId)) {
      onChange(selected.filter((id) => id !== botId));
    } else if (selected.length < GROUP_MEMBER_MAX) {
      setEverPicked((current) => new Set(current).add(botId));
      onChange([...selected, botId]);
    }
  };

  return (
    <div className="mt-5 flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--color-muted)]">Members ({selected.length})</span>
        <button
          type="button"
          className="text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show selected" : "Show all"}
        </button>
      </div>
      {expanded ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter bots"
            aria-label="Filter bots"
            className="mt-2 h-9 w-full rounded-xl border border-[var(--color-line)] bg-transparent px-3 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
          />
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Pick {GROUP_MEMBER_MIN}–{GROUP_MEMBER_MAX}
          </p>
        </>
      ) : null}
      <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
        {visible.map((bot) => {
          const checked = selected.includes(bot.id);
          const label = agentLooks[bot.id]?.name || bot.name;
          return (
            <div
              key={bot.id}
              className={`flex w-full items-center rounded-xl px-2.5 py-2 ${
                checked ? "bg-zinc-100 dark:bg-white/8" : "hover:bg-zinc-50 dark:hover:bg-white/5"
              }`}
            >
              <button
                type="button"
                onClick={() => onOpenBot?.(bot.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-start"
                title="Open this bot's chat"
              >
                <Avatar id={bot.id} name={label} emoji={bot.emoji} size={32} alive />
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-ink)]">
                  {label}
                </span>
              </button>
              <input
                type="checkbox"
                checked={checked}
                aria-label={
                  checked ? `Remove ${label} from the group` : `Add ${label} to the group`
                }
                onChange={() => toggle(bot.id)}
                className="size-4 accent-zinc-900 dark:accent-zinc-100"
              />
            </div>
          );
        })}
        {visible.length === 0 ? (
          <p className="px-2.5 py-2.5 text-sm text-[var(--color-muted)]">
            {expanded ? "No bots match" : "No members yet"}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Rakazo-aligned Group settings (not an IM room card).
 * Name + member checkboxes → groups.update; Delete → groups.remove.
 */
export function GroupSettingsPanel() {
  const selection = useWorkspace((s) => s.selection);
  const groups = useWorkspace((s) => s.groups);
  const bots = useWorkspace((s) => s.bots);
  const updateGroupRemote = useWorkspace((s) => s.updateGroupRemote);
  const removeGroupRemote = useWorkspace((s) => s.removeGroupRemote);
  const openBot = useWorkspace((s) => s.openBot);
  const showToast = useUi((s) => s.showToast);
  const rootRef = useRef<HTMLElement>(null);

  const group: Group | undefined =
    selection?.kind === "group"
      ? groups.find((g) => g.id === selection.groupId)
      : undefined;

  const [name, setName] = useState(group?.name ?? "");
  const [selected, setSelected] = useState<string[]>(
    () => group?.members.map((m) => m.botId) ?? [],
  );
  const [draftGroupId, setDraftGroupId] = useState(group?.id);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    enterEditorRail(rootRef.current);
  }, [group?.id]);

  // Switching groups resets the draft; same-group roster refresh keeps dirty fields.
  if (group && group.id !== draftGroupId) {
    setDraftGroupId(group.id);
    setName(group.name);
    setSelected(group.members.map((m) => m.botId));
    setConfirmingDelete(false);
    setError(null);
  }

  useEffect(() => {
    if (saving || confirmingDelete) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRightPanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [saving, confirmingDelete]);

  if (!group) {
    return (
      <aside
        ref={rootRef}
        className="flex h-full min-h-0 w-full flex-1 flex-col bg-[var(--color-surface)]"
      >
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Group settings</p>
          <p className="text-xs leading-relaxed text-[var(--color-muted)]">
            Open a group from the sidebar to rename it or change who is in the shared conversation.
          </p>
        </div>
      </aside>
    );
  }

  const save = async () => {
    if (saving || !validSelection(name, selected)) return;
    setSaving(true);
    setError(null);
    try {
      await updateGroupRemote({
        groupId: group.id,
        name: name.trim() !== group.name ? name.trim() : undefined,
        botIds: sameMembers(
          selected,
          group.members.map((m) => m.botId),
        )
          ? undefined
          : selected,
      });
      showToast("Group saved");
      closeRightPanel();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save group");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError(null);
    try {
      await removeGroupRemote(group.id);
      showToast("Group deleted");
      closeRightPanel();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete group");
      setConfirmingDelete(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside
      ref={rootRef}
      className="flex h-full min-h-0 w-full flex-1 flex-col bg-[var(--color-surface)]"
    >
      <div className="pica-scroll flex min-h-0 flex-1 flex-col overflow-auto px-5 pt-[17px] pb-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-[var(--color-muted)]">Group settings</span>
          <button
            type="button"
            aria-label="Close panel"
            disabled={saving}
            onClick={() => closeRightPanel()}
            className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-white/8"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        {error ? (
          <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}

        <label className="block text-sm text-[var(--color-muted)]">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={GROUP_NAME_MAX_LENGTH}
            className="mt-2 h-9 w-full rounded-xl border border-[var(--color-line)] bg-transparent px-3 text-sm text-[var(--color-ink)] outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
          />
        </label>

        <MemberPicker
          bots={bots}
          selected={selected}
          onChange={setSelected}
          onOpenBot={(botId) => {
            void openBot(botId);
          }}
        />

        <Button
          className="mt-5 w-full"
          disabled={saving || !validSelection(name, selected)}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="danger"
          className="mt-3 w-full"
          disabled={saving}
          onClick={() => setConfirmingDelete(true)}
        >
          Delete group
        </Button>

        {confirmingDelete ? (
          <div
            role="alertdialog"
            aria-label="Delete group"
            className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/50 dark:bg-rose-950/40"
          >
            <p className="text-sm font-medium text-rose-800 dark:text-rose-200">
              Delete “{group.name}”?
            </p>
            <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/80">
              Removes this shared conversation. Each bot keeps its own memory and computer.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button variant="danger" size="sm" disabled={saving} onClick={() => void remove()}>
                Delete
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
