import { useEffect, useRef, useState, type ReactNode } from "react";
import { enterStatusCard } from "@/lib/motion";
import { useConnection } from "@/stores/connection";
import { useWorkspace } from "@/stores/workspace";
import type { ApprovalAnswer, ApprovalPayload } from "@/types/gateway";

/** Soft BoardUI-style approval chip card — Allow / Deny / Always. */
export function ApprovalCard({ payload }: { payload: ApprovalPayload }) {
  const client = useConnection((s) => s.client);
  const selection = useWorkspace((s) => s.selection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(payload.status);

  const pending = localStatus === "pending";
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    enterStatusCard(cardRef.current);
  }, []);

  const decide = async (answer: ApprovalAnswer) => {
    if (!client || busy || !selection) return;
    if (!payload.runId || !payload.messageId) {
      setError("Missing runId/messageId for threads.answer.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const target =
        selection.kind === "dm"
          ? { botId: selection.botId }
          : { groupId: selection.groupId };
      await client.resolveApproval(target, {
        runId: payload.runId,
        messageId: payload.messageId,
        answer,
      });
      setLocalStatus("answered");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the decision.");
    } finally {
      setBusy(false);
    }
  };

  const actions =
    payload.actions && payload.actions.length > 0
      ? payload.actions
      : [
          { id: "allow", label: "Allow" },
          { id: "deny", label: "Deny" },
          ...(payload.canRemember || payload.site
            ? [{ id: "always", label: payload.site ? `Always · ${payload.site}` : "Always" }]
            : []),
        ];

  return (
    <div
      ref={cardRef}
      className="pica-status-card w-full max-w-[min(340px,90%)] overflow-hidden rounded-[18px] border border-amber-500/25 bg-[var(--color-surface)] px-[18px] py-4 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:border-amber-400/20 dark:bg-[#17171A] dark:shadow-none"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
        <p className="text-[11px] font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-200">
          {pending ? "Needs approval" : "Answered"}
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-[14.5px] font-medium text-zinc-900 dark:text-zinc-50">{payload.action}</p>
        {payload.detail ? (
          <p className="text-sm whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
            {payload.detail}
          </p>
        ) : null}
        {payload.approvalEffectId ? (
          <p className="font-mono text-[10px] text-[var(--color-muted)]">
            effect · {payload.approvalEffectId}
          </p>
        ) : null}
        {payload.site ? (
          <p className="text-[11px] text-[var(--color-muted)]">site · {payload.site}</p>
        ) : null}

        {pending ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {actions.map((action) => {
              const answer = (["allow", "deny", "always"].includes(action.id)
                ? action.id
                : "allow") as ApprovalAnswer;
              const accent = action.id === "allow" || action.id === "always";
              const ghost = action.id === "always";
              return (
                <Chip
                  key={action.id}
                  accent={accent && !ghost}
                  ghost={ghost}
                  disabled={busy}
                  onClick={() => void decide(answer)}
                >
                  {action.label}
                </Chip>
              );
            })}
          </div>
        ) : null}
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      </div>
    </div>
  );
}

function Chip({
  children,
  onClick,
  disabled,
  accent,
  ghost,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  ghost?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-[11px] px-[17px] py-2 text-[14.5px] font-medium transition disabled:opacity-50 ${
        accent
          ? "bg-[var(--color-accent)] text-white shadow-sm hover:opacity-90"
          : ghost
            ? "text-amber-800 hover:bg-amber-500/10 dark:text-amber-200"
            : "border border-[var(--color-line)] bg-white text-zinc-700 hover:bg-zinc-50 dark:bg-white/5 dark:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
