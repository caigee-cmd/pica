import { useEffect, useRef, useState, type ReactNode } from "react";
import { enterStatusCard } from "@/lib/motion";
import { MarkdownView } from "@/components/MarkdownView";
import { Typewriter } from "@/components/Typewriter";
import { ApprovalCard } from "@/modules/approvals/ApprovalCard";
import { gatewayFetch } from "@/lib/transport";
import { isTauri } from "@/lib/platform";
import { openMediaWindow } from "@/lib/windows";
import { useConnection } from "@/stores/connection";
import { useWorkspace } from "@/stores/workspace";
import type {
  ActivityPayload,
  ApprovalPayload,
  ApprovalResolvedPayload,
  BotRefPayload,
  LoginPayload,
  MemoryPayload,
  Message,
  QuestionPayload,
  ReportPayload,
  RoutinePayload,
  ScreenshotPayload,
  WebhookPayload,
} from "@/types/gateway";

function useCardEnter<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    enterStatusCard(ref.current);
  }, []);
  return ref;
}

/** Rakazo-aligned status / ask card chrome. */
function StatusShell({
  children,
  tone = "neutral",
  label,
}: {
  children: ReactNode;
  tone?: "neutral" | "ask" | "ok";
  label?: string;
}) {
  const ref = useCardEnter<HTMLDivElement>();
  const toneCls =
    tone === "ask"
      ? "border-amber-500/25 dark:border-amber-400/20"
      : tone === "ok"
        ? "border-emerald-500/25 dark:border-emerald-400/20"
        : "border-[var(--color-line)]";
  return (
    <div
      ref={ref}
      className={`pica-status-card w-full max-w-[min(340px,90%)] overflow-hidden rounded-[18px] border ${toneCls} bg-[var(--color-surface)] px-[18px] py-4 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:bg-[#17171A] dark:shadow-none`}
    >
      {label ? (
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase">
          {label}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function MessageBody({
  message,
  streaming,
  onStreamDone,
  highlightMentions,
}: {
  message: Message;
  streaming: boolean;
  onStreamDone?: () => void;
  /** Group threads: lightly style @Name in text. */
  highlightMentions?: boolean;
}) {
  switch (message.kind) {
    case "text":
      return streaming ? (
        <Typewriter text={message.content} active onDone={onStreamDone} highlightMentions={highlightMentions} />
      ) : (
        <MarkdownView text={message.content} highlightMentions={highlightMentions} />
      );
    case "report":
      return <ReportCard payload={message.payload as ReportPayload} />;
    case "approval_request":
      return <ApprovalCard payload={message.payload as ApprovalPayload} />;
    case "approval_resolved":
      return <ResolvedCard payload={message.payload as ApprovalResolvedPayload} />;
    case "question":
      return <QuestionCard messageId={message.id} payload={message.payload as QuestionPayload} />;
    case "activity":
      return <ActivityCard payload={message.payload as ActivityPayload} />;
    case "screenshot":
      return <ScreenshotCard payload={message.payload as ScreenshotPayload} />;
    case "routine_created":
      return <RoutineNote payload={message.payload as RoutinePayload} />;
    case "memory_updated":
      return <MemoryNote payload={message.payload as MemoryPayload} />;
    case "login_request":
      return <LoginNote payload={message.payload as LoginPayload} />;
    case "bot_ref":
      return <BotRefNote payload={message.payload as BotRefPayload} />;
    case "webhook":
      return <WebhookNote payload={message.payload as WebhookPayload} />;
    default:
      return <MarkdownView text={message.content} />;
  }
}

function ReportCard({ payload }: { payload: ReportPayload | null }) {
  if (!payload) return null;
  return (
    <StatusShell label="Report">
      <div className="space-y-1.5">
        {payload.lines.map((line) => (
          <p key={`${line.system}-${line.result}`} className="text-[14.5px]">
            <span className="text-emerald-600">✓</span> {line.system}
            <span className="text-[var(--color-muted)]"> → </span>
            {line.result}
            {line.count ? <span className="text-[var(--color-muted)]"> · {line.count}</span> : null}
          </p>
        ))}
        {payload.closing ? <p className="pt-1 text-[14.5px]">{payload.closing}</p> : null}
      </div>
    </StatusShell>
  );
}

function ResolvedCard({ payload }: { payload: ApprovalResolvedPayload | null }) {
  if (!payload) return null;
  const label =
    payload.decision === "deny"
      ? "Denied"
      : payload.decision === "always"
        ? "Always allowed"
        : "Allowed";
  const ok = payload.decision !== "deny";
  return (
    <StatusShell tone={ok ? "ok" : "neutral"} label="Decision">
      <div className="flex items-center gap-2 text-[14.5px]">
        <span
          className={`size-1.5 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-zinc-400"}`}
          aria-hidden
        />
        <p>
          <span className="font-medium">{label}</span>
          <span className="text-[var(--color-muted)]"> · {payload.action}</span>
        </p>
      </div>
    </StatusShell>
  );
}

function QuestionCard({ messageId, payload }: { messageId: string; payload: QuestionPayload | null }) {
  const client = useConnection((s) => s.client);
  const selection = useWorkspace((s) => s.selection);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [localOpen, setLocalOpen] = useState(payload?.status === "open");
  if (!payload) return null;
  const open = localOpen && payload.status === "open";

  const toggle = (optionId: string) => {
    setPicked((current) =>
      current.includes(optionId) ? current.filter((item) => item !== optionId) : [...current, optionId],
    );
  };

  const submit = async (answer: string) => {
    if (!client || !selection) return;
    if (!payload.runId) {
      setError("Missing runId for threads.answer.");
      return;
    }
    try {
      const target =
        selection.kind === "dm"
          ? { botId: selection.botId }
          : { groupId: selection.groupId };
      await client.answerQuestion(target, {
        runId: payload.runId,
        messageId: payload.messageId || messageId,
        answer,
      });
      setLocalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the answer.");
    }
  };

  return (
    <StatusShell tone="ask" label={open ? "Question" : "Answered"}>
      <div className="space-y-2.5">
        <p className="text-[14.5px] font-medium text-zinc-900 dark:text-zinc-50">{payload.question}</p>
        {payload.subtitle ? (
          <p className="text-xs text-[var(--color-muted)]">{payload.subtitle}</p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {payload.options.map((option) => {
            const on = payload.answerId === option.id || picked.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                disabled={!open}
                onClick={() => (payload.multi ? toggle(option.id) : void submit(option.id))}
                className={`rounded-[11px] px-[17px] py-2 text-[14.5px] font-medium transition disabled:opacity-70 ${
                  on
                    ? "bg-[var(--color-accent)] text-white shadow-sm"
                    : "bg-[#F1F1EF] text-[#17171A] hover:brightness-95 dark:bg-white/10 dark:text-zinc-100"
                }`}
              >
                {option.letter ? `${option.letter}. ` : ""}
                {option.label}
              </button>
            );
          })}
        </div>
        {open && payload.multi ? (
          <button
            type="button"
            className="rounded-[11px] bg-[#F1F1EF] px-[17px] py-2 text-[14.5px] font-medium text-[#17171A] dark:bg-white/10 dark:text-zinc-100"
            onClick={() => void submit(picked.join(","))}
          >
            Send selection
          </button>
        ) : null}
        {payload.status !== "open" && payload.answerId ? (
          <p className="text-[11px] text-[var(--color-muted)]">
            Answered: {payload.options.find((o) => o.id === payload.answerId)?.label ?? payload.answerId}
          </p>
        ) : null}
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      </div>
    </StatusShell>
  );
}

function ActivityCard({ payload }: { payload: ActivityPayload | null }) {
  if (!payload) return null;
  return (
    <StatusShell label={payload.done ? "Activity" : "Working"}>
      <ol className="space-y-1 text-[13px] text-[var(--color-muted)]">
        {payload.steps.map((step, index) => (
          <li key={`${step.tool}-${index}`}>
            <span className="font-mono text-[var(--color-ink)]">{step.tool}</span> {step.summary}
            {step.ok === false ? " · failed" : ""}
          </li>
        ))}
        {!payload.done ? <li className="animate-pulse">Working…</li> : null}
      </ol>
    </StatusShell>
  );
}

function ScreenshotCard({ payload }: { payload: ScreenshotPayload | null }) {
  const config = useConnection((s) => s.config);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!payload?.url) return;
    let objectUrl = "";
    let cancelled = false;
    const path = payload.url.startsWith("/") ? payload.url : new URL(payload.url, config.baseUrl).pathname;
    void gatewayFetch(config, path)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [config, payload]);
  if (!payload) return null;
  return (
    <figure className="space-y-1">
      {src ? (
        <button
          type="button"
          className="block max-w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
          title="在独立窗口查看"
          onClick={() => {
            if (!payload.url) return;
            if (!isTauri) {
              window.open(src, "_blank", "noopener,noreferrer");
              return;
            }
            const path = payload.url.startsWith("/")
              ? payload.url
              : new URL(payload.url, config.baseUrl).pathname;
            void openMediaWindow({
              src: path,
              title: payload.caption || "截图",
            }).catch(() => {
              window.open(src, "_blank", "noopener,noreferrer");
            });
          }}
        >
          <img
            src={src}
            alt={payload.caption || "Screenshot"}
            width={payload.width}
            height={payload.height}
            className="max-h-72 max-w-full rounded-lg border border-[var(--color-line)]"
          />
        </button>
      ) : (
        <p className="text-xs text-[var(--color-muted)]">Screenshot unavailable.</p>
      )}
      {payload.caption ? <figcaption className="text-xs text-[var(--color-muted)]">{payload.caption}</figcaption> : null}
    </figure>
  );
}

function RoutineNote({ payload }: { payload: RoutinePayload | null }) {
  if (!payload) return null;
  return (
    <p className="text-sm">
      Routine · {payload.name}
      <span className="text-[var(--color-muted)]"> · {payload.human}</span>
    </p>
  );
}

function MemoryNote({ payload }: { payload: MemoryPayload | null }) {
  if (!payload) return null;
  return (
    <div className="text-sm">
      <p>{payload.removed ? "Forgot a rule" : "Remembered a rule"}</p>
      <pre className="mt-1 overflow-auto text-xs whitespace-pre-wrap">{payload.diff || payload.rule}</pre>
    </div>
  );
}

function LoginNote({ payload }: { payload: LoginPayload | null }) {
  if (!payload) return null;
  return (
    <p className="text-sm">
      Sign in on the bot&apos;s computer · {payload.site}
      {payload.why ? <span className="text-[var(--color-muted)]"> · {payload.why}</span> : null}
    </p>
  );
}

function BotRefNote({ payload }: { payload: BotRefPayload | null }) {
  if (!payload) return null;
  return (
    <div className="text-sm">
      <p className="text-xs text-[var(--color-muted)]">From {payload.fromName}</p>
      <MarkdownView text={payload.content} />
    </div>
  );
}

function WebhookNote({ payload }: { payload: WebhookPayload | null }) {
  if (!payload) return null;
  return (
    <div className="text-sm">
      <p className="text-xs text-[var(--color-muted)]">Webhook · {payload.name}</p>
      <pre className="mt-1 max-h-40 overflow-auto text-xs whitespace-pre-wrap">{payload.body}</pre>
    </div>
  );
}

