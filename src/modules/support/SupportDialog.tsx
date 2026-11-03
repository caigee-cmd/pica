import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { fadeQuick } from "@/lib/motion";
import { useUi } from "@/stores/ui";

/** Lightweight “A little help” stub — Enter sends a toast, no backend. */
export function SupportDialog() {
  const open = useUi((s) => s.supportOpen);
  const setSupportOpen = useUi((s) => s.setSupportOpen);
  const showToast = useUi((s) => s.showToast);
  const [text, setText] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    fadeQuick(panelRef.current);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSupportOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setSupportOpen]);

  if (!open) return null;

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    showToast("Thanks — support stub received your note");
    setText("");
    setSupportOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="pica-scrim absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]"
        aria-label="Close support"
        onClick={() => setSupportOpen(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-label="A little help"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-soft)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold">A little help</p>
            <p className="text-[11px] text-[var(--color-muted)]">
              Stub support — nothing is sent to a server
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-white/8"
            onClick={() => setSupportOpen(false)}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4">
          <textarea
            ref={inputRef}
            value={text}
            rows={4}
            placeholder="What should we improve?"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            className="w-full resize-none rounded-xl border border-[var(--color-line)] bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-300 dark:bg-white/5 dark:focus:border-white/20"
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px] text-[var(--color-muted)]">Enter to send · Shift+Enter newline</p>
            <button
              type="button"
              onClick={send}
              className="rounded-full bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-semibold text-white"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
