import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { enterDialogPanel } from "@/lib/motion";
import { useConnection } from "@/stores/connection";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";

/** In-app create-bot form — replaces window.prompt (broken/no-op in Tauri webviews). */
export function CreateBotDialog() {
  const open = useUi((s) => s.createBotOpen);
  const setOpen = useUi((s) => s.setCreateBotOpen);
  const setEditorOpen = useUi((s) => s.setEditorOpen);
  const showToast = useUi((s) => s.showToast);
  const client = useConnection((s) => s.client);
  const refreshRoster = useWorkspace((s) => s.refreshRoster);
  const openBot = useWorkspace((s) => s.openBot);

  const [name, setName] = useState("Teammate");
  const [role, setRole] = useState("Helpful agent");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName("Teammate");
    setRole("Helpful agent");
    setBusy(false);
    enterDialogPanel(panelRef.current);
    const t = window.setTimeout(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    }, 30);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, busy]);

  if (!open) return null;

  const close = () => {
    if (busy) return;
    setOpen(false);
  };

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || busy) return;
    if (!client) {
      showToast("Connect a gateway in Settings first");
      return;
    }
    setBusy(true);
    try {
      const bot = await client.createBot(trimmedName, role.trim() || "Helpful agent");
      await refreshRoster();
      showToast(`Created ${bot.name}`);
      setOpen(false);
      void openBot(bot.id);
      setEditorOpen(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Create bot failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="pica-scrim absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]"
        aria-label="Close create bot"
        onClick={close}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-label="Create a new bot"
        className="relative w-full max-w-md overflow-hidden pica-dialog-panel rounded-[18px] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-soft)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Create a new bot</p>
            <p className="text-[11px] text-[var(--color-muted)]">
              Name and role are sent to the gateway
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-white/8"
            onClick={close}
            aria-label="Close"
            disabled={busy}
          >
            <X size={16} />
          </button>
        </div>

        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
              Name
            </span>
            <input
              ref={nameRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Teammate"
              disabled={busy}
              className="h-10 rounded-xl border border-[var(--color-line)] bg-zinc-50 px-3 text-sm outline-none focus:border-zinc-300 dark:bg-white/5 dark:focus:border-white/20"
              autoComplete="off"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
              Role / description
            </span>
            <textarea
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="Helpful agent"
              rows={3}
              disabled={busy}
              className="resize-none rounded-xl border border-[var(--color-line)] bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-300 dark:bg-white/5 dark:focus:border-white/20"
            />
          </label>

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="rounded-full border border-[var(--color-line)] px-3.5 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40 dark:hover:bg-white/8"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="rounded-full bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
