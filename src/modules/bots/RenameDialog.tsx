import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { enterDialogPanel } from "@/lib/motion";
import { useConnection } from "@/stores/connection";
import { useLocalChrome } from "@/stores/localChrome";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";

/** In-app rename — prefers groups.update / bots.update when connected. */
export function RenameDialog() {
  const target = useUi((s) => s.renameTarget);
  const setRenameTarget = useUi((s) => s.setRenameTarget);
  const showToast = useUi((s) => s.showToast);
  const rename = useLocalChrome((s) => s.rename);
  const client = useConnection((s) => s.client);
  const updateGroupRemote = useWorkspace((s) => s.updateGroupRemote);
  const refreshRoster = useWorkspace((s) => s.refreshRoster);

  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = target != null;

  useEffect(() => {
    if (!target) return;
    setTitle(target.title);
    enterDialogPanel(panelRef.current);
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRenameTarget(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [target, setRenameTarget]);

  if (!open || !target) return null;

  const close = () => setRenameTarget(null);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    void (async () => {
      setBusy(true);
      try {
        if (client && target.kind === "group") {
          await updateGroupRemote({ groupId: target.id, name: trimmed });
          showToast("Group renamed");
        } else if (client && target.kind === "bot") {
          await client.updateBot({ botId: target.id, name: trimmed });
          await refreshRoster();
          showToast("Bot renamed");
        } else {
          rename(target.id, trimmed);
          showToast("Renamed locally");
        }
        setRenameTarget(null);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Rename failed");
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="pica-scrim absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]"
        aria-label="Close rename"
        onClick={close}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-label="Rename conversation"
        className="relative w-full max-w-sm overflow-hidden pica-dialog-panel rounded-[18px] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-soft)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Rename</p>
            <p className="text-[11px] text-[var(--color-muted)]">
              {client && target.kind
                ? "Saves to the gateway"
                : "Local label only — gateway name unchanged"}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-white/8"
            onClick={close}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
              Title
            </span>
            <input
              ref={inputRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-10 rounded-xl border border-[var(--color-line)] bg-zinc-50 px-3 text-sm outline-none focus:border-zinc-300 dark:bg-white/5 dark:focus:border-white/20"
              autoComplete="off"
              disabled={busy}
            />
          </label>

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-full border border-[var(--color-line)] px-3.5 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-white/8"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || busy}
              className="rounded-full bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
