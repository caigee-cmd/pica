import type { CSSProperties } from "react";
import { ActionBar } from "@/components/ActionBar";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { isCompatibility, isMac } from "@/lib/platform";
import { useConnection } from "@/stores/connection";
import { attentionBadgeCount, useAttention } from "@/stores/attention";

/**
 * Shared overlay titlebar chrome (Lulu/HuLa shell structure).
 * - macOS: drag region; native traffic lights via decorum (no ActionBar).
 * - Windows/Linux: same chrome + frontend ActionBar.
 *
 * Real three-zone layout aligned to `--sidebar-w` / `--editor-w` so the
 * bar reads as window chrome continuing into columns — not a web strip.
 * Colors stay BoardUI/Rakazo tokens.
 */
export function Titlebar() {
  const state = useConnection((s) => s.state);
  const detail = useConnection((s) => s.detail);
  const attentionCount = useAttention((s) =>
    Object.values(s.byThread).reduce((sum, e) => sum + attentionBadgeCount(e), 0),
  );
  const winChrome = isCompatibility;

  return (
    <header
      {...(isMac ? { "data-tauri-decorum-tb": true } : {})}
      className="pica-titlebar relative z-50 flex h-[var(--titlebar-h)] shrink-0 items-stretch select-none"
      style={
        {
          ["--titlebar-traffic-pad" as string]: isMac ? "78px" : "12px",
          ["--titlebar-controls-pad" as string]: winChrome ? "0px" : "8px",
        } as CSSProperties
      }
    >
      {/* Left = sidebar column surface */}
      <div
        data-tauri-drag-region
        className="pica-titlebar-zone pica-titlebar-zone--rail flex shrink-0 items-center"
        style={{
          width: "var(--sidebar-w)",
          paddingLeft: "var(--titlebar-traffic-pad)",
          paddingRight: "10px",
        }}
      >
        <div data-tauri-drag-region className="flex min-w-0 items-center gap-2">
          <span
            data-tauri-drag-region
            className="truncate text-[13px] font-semibold tracking-tight text-[var(--color-ink)]"
          >
            Pica
          </span>
          <span
            role="status"
            className="inline-flex min-w-0 items-center"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          >
            <ConnectionBadge state={state} detail={detail} attentionCount={attentionCount} />
          </span>
        </div>
      </div>

      {/* Center = thread column — pure drag chrome */}
      <div
        data-tauri-drag-region
        className="pica-titlebar-zone pica-titlebar-zone--thread min-w-0 flex-1"
        aria-hidden
      />

      {/* Right = editor column / ActionBar */}
      <div
        data-tauri-drag-region
        className="pica-titlebar-zone pica-titlebar-zone--editor flex shrink-0 items-stretch justify-end"
        style={{
          width: winChrome ? undefined : "var(--editor-w)",
          minWidth: 0,
          paddingRight: winChrome ? "0px" : "var(--titlebar-controls-pad)",
        }}
      >
        {winChrome ? <ActionBar /> : null}
      </div>
    </header>
  );
}
