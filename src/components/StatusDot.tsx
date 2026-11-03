import type { BotStatus } from "@/types/gateway";
import { cn } from "@/lib/utils";

const LABEL: Record<BotStatus, string> = {
  thinking: "Working",
  waiting: "Waiting on you",
  blocked: "Blocked",
  idle: "Idle",
  done: "Finished while you were away",
};

/** Rakazo status-working / warning / destructive / faint / working-dot. */
const COLOR: Record<BotStatus, string> = {
  thinking: "bg-[var(--color-status-working)]",
  waiting: "bg-[var(--color-status-waiting)]",
  blocked: "bg-[var(--color-status-blocked)]",
  idle: "bg-[var(--color-status-idle)]",
  done: "bg-[var(--color-status-done)]",
};

export function StatusDot({ status, className }: { status: BotStatus; className?: string }) {
  return (
    <span
      title={LABEL[status]}
      className={cn(
        "inline-block size-2 rounded-full",
        COLOR[status],
        status === "thinking" && "animate-pulse",
        className,
      )}
    />
  );
}

export function statusLabel(status: BotStatus): string {
  return LABEL[status];
}
