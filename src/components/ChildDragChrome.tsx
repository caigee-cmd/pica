import type { CSSProperties, ReactNode } from "react";
import { isMac } from "@/lib/platform";

/**
 * Slim macOS Overlay drag strip for child OS windows (login / settings / screen).
 * Traffic-light padding only — no brand, ConnectionBadge, or main three-zone chrome.
 * Win/Linux children use native decorations, so this renders nothing there.
 */
export function ChildDragChrome({
  title,
  trailing,
}: {
  /** Optional muted label in the drag region (e.g. 设置). */
  title?: string;
  /** Non-drag controls on the right (rare). */
  trailing?: ReactNode;
}) {
  if (!isMac) return null;

  return (
    <header
      data-tauri-drag-region
      className="flex h-[var(--titlebar-h)] shrink-0 items-center select-none bg-[var(--color-paper)]"
      style={
        {
          paddingLeft: "var(--titlebar-traffic-pad-child, 78px)",
          paddingRight: "12px",
          WebkitAppRegion: "drag",
        } as CSSProperties
      }
    >
      {title ? (
        <span
          data-tauri-drag-region
          className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-muted)]"
        >
          {title}
        </span>
      ) : (
        <span data-tauri-drag-region className="min-w-0 flex-1" aria-hidden />
      )}
      {trailing ? (
        <div
          className="ml-2 flex shrink-0 items-center gap-1"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          {trailing}
        </div>
      ) : null}
    </header>
  );
}
