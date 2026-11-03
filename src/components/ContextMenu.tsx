import { useEffect, useRef } from "react";
import { fadeQuick } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type ContextMenuItem = {
  id: string;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fadeQuick(ref.current);
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const left = Math.min(x, typeof window !== "undefined" ? window.innerWidth - 220 : x);
  const top = Math.min(y, typeof window !== "undefined" ? window.innerHeight - 280 : y);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[70] min-w-[200px] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-soft)]"
      style={{ left, top }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            item.onSelect();
            onClose();
          }}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-40",
            item.danger
              ? "text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
              : "hover:bg-zinc-100 dark:hover:bg-white/8",
          )}
        >
          <span className="flex-1">{item.label}</span>
          {item.hint ? (
            <span className="text-[10px] text-[var(--color-muted)]">{item.hint}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
