import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { closeRightPanel } from "@/components/SidePanelChrome";
import { useUi } from "@/stores/ui";
import { Avatar } from "@/components/Avatar";
import { SHAPE_PATHS, type ShapeId } from "@/lib/avatarShapes";
import { enterEditorRail, morphSquash, springSoft } from "@/lib/motion";
import { colorFor } from "@/lib/utils";
import {
  COLOR_PRESETS,
  EMOTION_PRESETS,
  SHAPE_PRESETS,
  usePrefs,
  type EmotionId,
} from "@/stores/prefs";
import { useConnection } from "@/stores/connection";
import { useWorkspace } from "@/stores/workspace";

/**
 * BoardUI-style right rail.
 * Server-backed via bots.update: name, description, color (hex).
 * Emotion + shape stay local (Rakazo color may encode ::shape_N, but Pica shapes differ).
 */
export function AgentEditor() {
  const selection = useWorkspace((s) => s.selection);
  const bots = useWorkspace((s) => s.bots);
  const refreshRoster = useWorkspace((s) => s.refreshRoster);
  const bot = selection?.kind === "dm" ? bots.find((b) => b.id === selection.botId) : undefined;
  const ensureAgent = usePrefs((s) => s.ensureAgent);
  const upsertAgent = usePrefs((s) => s.upsertAgent);
  const look = usePrefs((s) => (bot ? s.agents[bot.id] : undefined));
  const client = useConnection((s) => s.client);
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const lastSpring = useRef<string>("");
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const setEditorOpen = useUi((s) => s.setEditorOpen);
  const setPanel = useWorkspace((s) => s.setPanel);


  useEffect(() => {
    enterEditorRail(rootRef.current);
  }, [bot?.id]);

  useEffect(() => {
    if (!bot) return;
    ensureAgent(bot.id, {
      name: bot.name,
      label: bot.id,
      description: bot.role,
      color: colorFor(bot.id),
    });
  }, [bot, ensureAgent]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRightPanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setEditorOpen]);

  useEffect(() => {
    if (!look || !bot) return;
    const key = `${look.color}:${look.emotion}:${look.shape}`;
    if (key === lastSpring.current) return;
    lastSpring.current = key;
    springSoft(canvasRef.current);
    springSoft(ringRef.current);
    morphSquash(canvasRef.current);
  }, [look?.color, look?.emotion, look?.shape, look, bot]);

  useEffect(() => {
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, []);

  const pushServer = (patch: { name?: string; description?: string; color?: string }) => {
    if (!bot || !client) {
      setSyncNote("本地已存 · 未连接，无法 bots.update");
      return;
    }
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      void (async () => {
        try {
          setSyncNote("同步中…");
          // Only hex colors — contracts BotAvatarValueSchema.
          const color =
            patch.color && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(patch.color)
              ? patch.color
              : undefined;
          await client.updateBot({
            botId: bot.id,
            ...(patch.name != null ? { name: patch.name.trim() || bot.name } : {}),
            ...(patch.description != null
              ? { description: patch.description, instructions: patch.description }
              : {}),
            ...(color ? { color } : {}),
          });
          await refreshRoster();
          setSyncNote("已写入 bots.update（name / description / color）");
        } catch (err) {
          setSyncNote(err instanceof Error ? err.message : "bots.update 失败");
        }
      })();
    }, 450);
  };

  if (!bot) {
    return (
      <aside ref={rootRef} className="flex h-full min-h-0 w-full flex-1 flex-col bg-[var(--color-surface)]">
        <div className="flex shrink-0 items-center justify-between px-5 pt-[17px] pb-3">
          <p className="text-sm text-[var(--color-muted)]">Agent</p>
          <button type="button" aria-label="Close panel" onClick={() => closeRightPanel()} className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-white/8">
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Agents</p>
          <p className="text-xs leading-relaxed text-[var(--color-muted)]">
            Open a teammate to edit shape, emotion, color, and name. Group chats keep the thread
            focused.
          </p>
        </div>
      </aside>
    );
  }

  const name = look?.name ?? bot.name;
  const label = look?.label ?? bot.id;
  const description = look?.description ?? bot.role;
  const color = look?.color ?? colorFor(bot.id);
  const emotion: EmotionId = look?.emotion ?? "neutral";
  const shape: ShapeId = look?.shape ?? "circle";

  return (
    <aside ref={rootRef} className="flex h-full min-h-0 w-full flex-1 flex-col bg-[var(--color-surface)]">
      <div className="flex shrink-0 items-center justify-between px-5 pt-[17px] pb-3">
        <p className="text-sm text-[var(--color-muted)]">Agent</p>
        <button type="button" aria-label="Close panel" onClick={() => closeRightPanel()} className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-white/8">
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>
      <div className="pica-scroll flex min-h-0 flex-1 flex-col items-center overflow-auto rounded-none px-5 pb-6">
        <div
          ref={canvasRef}
          className="pica-avatar-canvas relative mb-5 flex size-28 items-center justify-center"
        >
          <div
            ref={ringRef}
            className="pica-emotion-ring absolute inset-0 rounded-full border-[3px]"
            style={{
              borderColor: color,
              boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent)`,
            }}
            aria-hidden
          />
          <Avatar
            id={bot.id}
            name={name}
            emoji={bot.emoji}
            size={88}
            alive
            color={color}
            emotion={emotion}
            shape={shape}
          />
        </div>

        <div className="mb-3 flex flex-wrap justify-center gap-1.5" role="group" aria-label="Shape">
          {SHAPE_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              title={`${item.label} · local only`}
              aria-label={item.label}
              aria-pressed={shape === item.id}
              onClick={() => upsertAgent(bot.id, { shape: item.id })}
              className={`flex size-8 items-center justify-center rounded-lg border transition ${
                shape === item.id
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-[var(--color-line)] bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
              }`}
            >
              <ShapeIcon id={item.id} active={shape === item.id} />
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap justify-center gap-1.5" role="group" aria-label="Emotion">
          {EMOTION_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              title="Local only — no bots.update field"
              onClick={() => upsertAgent(bot.id, { emotion: item.id })}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                emotion === item.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/8 dark:text-zinc-300 dark:hover:bg-white/12"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mb-6 flex flex-wrap justify-center gap-2.5" aria-label="Accent colors">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className={`size-5 rounded-full transition ${
                color === c
                  ? "scale-110 ring-2 ring-zinc-900 ring-offset-2 dark:ring-zinc-100 dark:ring-offset-zinc-950"
                  : "ring-0 hover:scale-110"
              }`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              onClick={() => {
                upsertAgent(bot.id, { color: c });
                pushServer({ color: c });
              }}
            />
          ))}
        </div>

        <Field
          label="Name"
          value={name}
          onChange={(value) => {
            upsertAgent(bot.id, { name: value });
            pushServer({ name: value });
          }}
        />
        <Field
          label="Label"
          value={label}
          mono
          onChange={(value) => upsertAgent(bot.id, { label: value })}
        />
        <label className="w-full space-y-1">
          <span className="text-[11px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
            Description
          </span>
          <textarea
            value={description}
            rows={4}
            onChange={(event) => {
              const value = event.target.value;
              upsertAgent(bot.id, { description: value });
              pushServer({ description: value });
            }}
            className="w-full resize-none rounded-2xl border border-[var(--color-line)] bg-zinc-50 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-[var(--color-accent)]/40 dark:bg-white/5 dark:focus:border-white/25"
          />
        </label>
      </div>

        <div data-testid="agent-ia-entries" className="mt-4 w-full space-y-1.5 border-t border-[var(--color-line)] pt-4 dark:border-white/10">
          <p className="px-0.5 text-[11px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
            Workspace
          </p>
          {(
            [
              { id: "computer" as const, label: "Computer", hint: "Screen / host" },
              { id: "routines" as const, label: "Routines", hint: "Schedules · History" },
              { id: "memory" as const, label: "Memory", hint: "Docs · budget" },
              { id: "skills" as const, label: "Skills", hint: "Taught · agent" },
              { id: "boards" as const, label: "Boards", hint: "Tickets · kanban" },
            ]
          ).map((row) => (
            <button
              key={row.id}
              type="button"
              className="flex w-full items-center justify-between rounded-2xl border border-[var(--color-line)] bg-zinc-50 px-3 py-2.5 text-left hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
              onClick={() => {
                setPanel(row.id);
                setEditorOpen(true);
              }}
            >
              <span className="text-sm font-medium text-[var(--color-ink)]">{row.label}</span>
              <span className="text-[11px] text-[var(--color-muted)]">{row.hint}</span>
            </button>
          ))}
        </div>

      <p className="shrink-0 border-t border-[var(--color-line)] px-4 py-3 text-center text-[11px] leading-relaxed text-[var(--color-muted)] dark:border-white/10">
        {syncNote ??
          "bots.update：name / description / color。Emotion 与 shape 仅本机（服务端无对应字段）。Label 仅本机。"}
      </p>
    </aside>
  );
}

function ShapeIcon({ id, active }: { id: ShapeId; active: boolean }) {
  const stroke = active ? "currentColor" : "currentColor";
  if (id === "circle") {
    return (
      <svg viewBox="0 0 100 100" className="size-4" aria-hidden>
        <ellipse cx="50" cy="50" rx="36" ry="36" fill="none" stroke={stroke} strokeWidth="8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" className="size-4" aria-hidden>
      <path d={SHAPE_PATHS[id]} fill="none" stroke={stroke} strokeWidth="7" strokeLinejoin="round" />
    </svg>
  );
}

function Field({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="mb-3 w-full space-y-1">
      <span className="text-[11px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`h-10 w-full rounded-2xl border border-[var(--color-line)] bg-zinc-50 px-3 text-sm outline-none focus:border-[var(--color-accent)]/40 dark:bg-white/5 dark:focus:border-white/25 ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}
