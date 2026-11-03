import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import type { Bot } from "@/types/gateway";

/** BoardUI-ish empty thread / rail copy with optional avatar cluster. */
export function EmptyState({
  title,
  subtitle,
  bots,
  name,
  actions,
  compact,
}: {
  title: string;
  subtitle?: string;
  /** Overlapping cluster when multiple; single centered when one. */
  bots?: Bot[];
  /** Display name for 1:1 “Say hello to {name}” — unused when title already set. */
  name?: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  const list = bots ?? [];
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3.5 text-center ${
        compact ? "min-h-[34vh] px-4" : "h-full min-h-[40vh] px-6"
      }`}
    >
      {list.length === 1 ? (
        <Avatar
          id={list[0].id}
          name={name || list[0].name}
          emoji={list[0].emoji}
          size={compact ? 56 : 72}
          alive
        />
      ) : list.length > 1 ? (
        <div className="flex items-center pl-2">
          {list.slice(0, 5).map((bot, index) => (
            <span
              key={bot.id}
              className="relative -ml-3 rounded-full first:ml-0 ring-[3px] ring-[var(--color-paper)]"
              style={{ zIndex: 10 - index }}
            >
              <Avatar id={bot.id} name={bot.name} emoji={bot.emoji} size={compact ? 40 : 48} alive />
            </span>
          ))}
          {list.length > 5 ? (
            <span className="relative -ml-2 inline-flex size-10 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700 ring-[3px] ring-[var(--color-paper)] dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-900">
              +{list.length - 5}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex size-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-white/8">
          ✦
        </div>
      )}
      <div className="space-y-1">
        <p className="text-[15px] font-medium tracking-[-0.01em] text-zinc-800 dark:text-zinc-100">{title}</p>
        {subtitle ? (
          <p className="max-w-sm text-sm leading-relaxed text-[var(--color-muted)]">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
