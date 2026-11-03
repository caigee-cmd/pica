import type { ConnectionState } from "@/types/gateway";
import { cn } from "@/lib/utils";

const COPY: Record<ConnectionState, string> = {
  idle: "未连接",
  connecting: "连接中",
  live: "已连接",
  reconnecting: "重连中",
  error: "出错",
};

const DOT: Record<ConnectionState, string> = {
  idle: "bg-stone-400",
  connecting: "bg-amber-500",
  live: "bg-emerald-500",
  reconnecting: "bg-amber-500 animate-pulse",
  error: "bg-rose-500",
};

export function ConnectionBadge({
  state,
  detail,
  attentionCount = 0,
}: {
  state: ConnectionState;
  detail?: string | null;
  /** Aggregate pending approvals / questions / unread across threads. */
  attentionCount?: number;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)]"
      title={
        attentionCount > 0
          ? `${COPY[state]} · ${attentionCount} 待处理${detail ? ` — ${detail}` : ""}`
          : (detail ?? COPY[state])
      }
    >
      <span className={cn("size-1.5 rounded-full", DOT[state])} />
      {COPY[state]}
      {attentionCount > 0 ? (
        <span className="rounded-full bg-rose-500 px-1.5 py-px text-[10px] font-semibold leading-none text-white">
          {attentionCount > 99 ? "99+" : attentionCount}
        </span>
      ) : null}
    </span>
  );
}
