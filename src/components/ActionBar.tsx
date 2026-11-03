import type { CSSProperties, ReactNode } from "react";
import { Minus, Square, X } from "lucide-react";
import { useWindow } from "@/hooks/useWindow";
import { isCompatibility } from "@/lib/platform";
import { cn } from "@/lib/utils";

/**
 * Frontend window controls for Windows/Linux (HuLa ActionBar pattern).
 * macOS uses native traffic lights via decorum — this component returns null there.
 * Visuals use Pica tokens, not HuLa's green IM chrome.
 */
export function ActionBar({ className }: { className?: string }) {
  const { maximized, minimize, toggleMaximize, close } = useWindow();

  if (!isCompatibility) return null;

  return (
    <div
      className={cn("flex h-full shrink-0 items-stretch", className)}
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      <ActionBtn label="Minimize" onClick={() => void minimize()}>
        <Minus size={14} strokeWidth={2} />
      </ActionBtn>
      <ActionBtn
        label={maximized ? "Restore" : "Maximize"}
        onClick={() => void toggleMaximize()}
      >
        {maximized ? <RestoreIcon /> : <Square size={12} strokeWidth={2} />}
      </ActionBtn>
      <ActionBtn label="Close" onClick={() => void close()} danger>
        <X size={14} strokeWidth={2} />
      </ActionBtn>
    </div>
  );
}

function RestoreIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3.5" y="1.5" width="7" height="7" rx="0.5" />
      <path d="M1.5 3.5V10a.5.5 0 0 0 .5.5h6.5" />
    </svg>
  );
}

function ActionBtn({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-full w-[46px] items-center justify-center text-[var(--color-ink)] transition-colors",
        danger
          ? "hover:bg-[#c22b1c] hover:text-white"
          : "hover:bg-zinc-200/80 dark:hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}
