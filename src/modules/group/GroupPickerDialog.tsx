import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { enterDialogPanel } from "@/lib/motion";
import { usePrefs } from "@/stores/prefs";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";

/**
 * Capsule multi-select of roster bots. Avatars overlap into a cluster as picks grow;
 * CTA fills blue “Create group · N agents”. Creates via groups.create.
 */
export function GroupPickerDialog() {
  const open = useUi((s) => s.groupPickerOpen);
  const setOpen = useUi((s) => s.setGroupPickerOpen);
  const showToast = useUi((s) => s.showToast);
  const bots = useWorkspace((s) => s.bots);
  const startChatWithAgents = useWorkspace((s) => s.startChatWithAgents);
  const agentLooks = usePrefs((s) => s.agents);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    enterDialogPanel(panelRef.current);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const selectedBots = useMemo(
    () => picked.map((id) => bots.find((b) => b.id === id)).filter(Boolean),
    [picked, bots],
  );

  if (!open) return null;

  const GROUP_MEMBER_MAX = 10;

  const toggle = (id: string) => {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= GROUP_MEMBER_MAX) return current;
      return [...current, id];
    });
  };

  const start = async () => {
    if (picked.length < 2 || picked.length > 10 || busy) return;
    setBusy(true);
    try {
      await startChatWithAgents(picked);
      setOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not create group");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="pica-scrim absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]"
        aria-label="Close group picker"
        onClick={() => setOpen(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-label="Create group"
        className="relative flex w-full max-w-lg flex-col overflow-hidden pica-dialog-panel rounded-[18px] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-soft)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold">New group</p>
            <p className="text-[11px] text-[var(--color-muted)]">Pick 2–10 bots for a shared conversation</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-white/8"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 border-b border-[var(--color-line)] px-4 py-5">
          {selectedBots.length === 0 ? (
            <div className="flex size-16 items-center justify-center rounded-full border border-dashed border-zinc-300 text-xs text-[var(--color-muted)] dark:border-white/20">
              Cluster
            </div>
          ) : (
            <div className="flex items-center pl-2">
              {selectedBots.slice(0, 6).map((bot, index) =>
                bot ? (
                  <span
                    key={bot.id}
                    className="relative -ml-3 rounded-full first:ml-0 ring-[3px] ring-[var(--color-surface)] transition-transform dark:ring-zinc-950"
                    style={{ zIndex: 20 - index }}
                  >
                    <Avatar
                      id={bot.id}
                      name={agentLooks[bot.id]?.name || bot.name}
                      emoji={bot.emoji}
                      size={44}
                      alive
                    />
                  </span>
                ) : null,
              )}
            </div>
          )}
          <p className="text-xs text-[var(--color-muted)]">
            {picked.length === 0
              ? "Tap capsules below"
              : picked.length === 1
                ? "Pick at least one more"
                : `${picked.length} bots selected`}
          </p>
        </div>

        <div className="pica-scroll max-h-[40vh] overflow-auto px-4 py-3">
          {bots.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">
              No bots on this gateway yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {bots.map((bot) => {
                const on = picked.includes(bot.id);
                const label = agentLooks[bot.id]?.name || bot.name;
                return (
                  <button
                    key={bot.id}
                    type="button"
                    onClick={() => toggle(bot.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium transition ${
                      on
                        ? "border-transparent bg-[var(--color-accent)] text-white shadow-sm"
                        : "border-[var(--color-line)] bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
                    }`}
                  >
                    <Avatar id={bot.id} name={label} emoji={bot.emoji} size={18} />
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-line)] p-4">
          <button
            type="button"
            disabled={picked.length < 2 || busy}
            onClick={() => void start()}
            className={`flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold transition disabled:cursor-not-allowed ${
              picked.length >= 2
                ? "bg-[var(--color-accent)] text-white shadow-sm hover:opacity-95"
                : "bg-zinc-100 text-zinc-400 dark:bg-white/8 dark:text-zinc-500"
            }`}
          >
            {picked.length >= 2
              ? `Create group · ${picked.length} bots`
              : "Create group · pick bots"}
          </button>
        </div>
      </div>
    </div>
  );
}
