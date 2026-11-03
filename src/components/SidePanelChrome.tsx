import { type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";

/** Match Rakazo side-panel: close clears panel + collapses the rail. */
export function closeRightPanel() {
  useWorkspace.getState().setPanel("none");
  useUi.getState().setEditorOpen(false);
}

/**
 * Shared right-rail chrome (~Rakazo ShellSidePanel / GroupSettings header).
 * Muted title, icon close, px-5 / pt-[17px] rhythm, dark-friendly surfaces.
 */
export function SidePanelChrome({
  title,
  subtitle,
  actions,
  children,
  bodyClassName,
  padded = true,
  onClose,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  /** When false, body has no horizontal padding (split panes manage their own). */
  padded?: boolean;
  onClose?: () => void;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-1 flex-col bg-[var(--color-surface)]">
      <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-[17px] pb-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-[var(--color-muted)]">{title}</p>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[11px] leading-snug text-[var(--color-muted)] opacity-80">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions}
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => (onClose ? onClose() : closeRightPanel())}
            className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-white/8"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <div
        className={cn(
          "pica-scroll min-h-0 flex-1 overflow-y-auto",
          padded && "px-5 pb-5",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </aside>
  );
}

export function SidePanelEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("px-1 py-8 text-center text-sm text-[var(--color-muted)]", className)}>
      {children}
    </p>
  );
}

export function SidePanelBanner({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "danger";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "mb-3 text-sm",
        tone === "danger"
          ? "text-rose-600 dark:text-rose-400"
          : "text-[var(--color-muted)]",
      )}
    >
      {children}
    </p>
  );
}

/** Pill tabs (~Rakazo TabsList full-width). */
export function SidePanelTabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (next: T) => void;
  items: { id: T; label: string }[];
}) {
  return (
    <div
      role="tablist"
      className="mb-4 flex w-full gap-0.5 rounded-xl bg-zinc-100/90 p-1 dark:bg-white/8"
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
              active
                ? "bg-white text-zinc-900 shadow-sm dark:bg-white/14 dark:text-zinc-50"
                : "text-[var(--color-muted)] hover:text-zinc-800 dark:hover:text-zinc-100",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** List / nav row (~Rakazo GroupPanel member rows). */
export function SidePanelRow({
  active,
  onClick,
  title,
  subtitle,
  trailing,
  dense = false,
}: {
  active?: boolean;
  onClick?: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** Tighter Memory/Skills list density (13–13.5px). */
  dense?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2 rounded-xl text-left transition",
        dense ? "px-2 py-1.5" : "px-2.5 py-2.5",
        active
          ? "bg-zinc-100 dark:bg-white/10"
          : "hover:bg-zinc-100/80 dark:hover:bg-white/8",
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate font-medium text-zinc-900 dark:text-zinc-50",
            dense ? "text-[13.5px] leading-snug" : "text-[13px]",
          )}
        >
          {title}
        </span>
        {subtitle ? (
          <span
            className={cn(
              "mt-0.5 block truncate text-[var(--color-muted)]",
              dense ? "text-[11px] leading-snug" : "text-[11px]",
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
      {trailing}
    </button>
  );
}

/** Ghost icon action used next to the panel close control. */
export function SidePanelIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-white/8"
    >
      {children}
    </button>
  );
}
