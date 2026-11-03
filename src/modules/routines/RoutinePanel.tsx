import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SidePanelChrome } from "@/components/SidePanelChrome";
import { useConnection } from "@/stores/connection";
import { useWorkspace } from "@/stores/workspace";
import type { ComputerRoutine, RoutineAction } from "@/types/gateway";

type Draft = {
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  notify: boolean;
  active: boolean;
  webhookEnabled: boolean;
  githubEnabled: boolean;
};

const emptyDraft = (): Draft => ({
  name: "",
  prompt: "",
  cron: "",
  timezone: "Asia/Shanghai",
  notify: true,
  active: false,
  webhookEnabled: false,
  githubEnabled: false,
});

function cronsFromField(cron: string): string[] {
  return cron
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function RoutinePanel() {
  const computer = useWorkspace((s) => s.computer);
  const loading = useWorkspace((s) => s.computerLoading);
  const selection = useWorkspace((s) => s.selection);
  const loadComputer = useWorkspace((s) => s.loadComputer);
  const client = useConnection((s) => s.client);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [history, setHistory] = useState<{ id?: string; createdAt?: string; status?: string }[]>([]);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const botId = selection?.kind === "dm" ? selection.botId : null;


  const loadHistory = async (routineId: string) => {
    if (!client) return;
    setError(null);
    setBusy(true);
    try {
      const page = await client.routineHistory({ routineId, limit: 20 });
      const runs = Array.isArray(page.runs) ? page.runs : [];
      setHistory(
        runs.map((r) => {
          const o = (r ?? {}) as Record<string, unknown>;
          return {
            id: typeof o.id === "string" ? o.id : undefined,
            createdAt: typeof o.createdAt === "string" ? o.createdAt : undefined,
            status: typeof o.status === "string" ? o.status : undefined,
          };
        }),
      );
      setHistoryFor(routineId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "History failed.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (routine: ComputerRoutine, action: RoutineAction) => {
    if (!client || !botId) return;
    setError(null);
    setBusy(true);
    try {
      await client.updateRoutine(routine.id, action);
      await loadComputer(botId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Routine update failed.");
    } finally {
      setBusy(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setCreating(true);
    setError(null);
  };

  const openEdit = (routine: ComputerRoutine) => {
    setCreating(false);
    setEditingId(routine.id);
    setDraft({
      name: routine.name,
      prompt: routine.prompt ?? "",
      cron: routine.cron,
      timezone: routine.timezone || "Asia/Shanghai",
      notify: routine.notify !== false,
      active: Boolean(routine.enabled),
      webhookEnabled: Boolean(routine.webhookEnabled || routine.webhook_path),
      githubEnabled: Boolean(routine.githubEnabled),
    });
    setError(null);
  };

  const cancelForm = () => {
    setCreating(false);
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const saveForm = async () => {
    if (!client || !botId) return;
    const name = draft.name.trim();
    const prompt = draft.prompt.trim();
    const crons = cronsFromField(draft.cron);
    if (!name) {
      setError("Name is required.");
      return;
    }
    if (!prompt) {
      setError("Prompt is required.");
      return;
    }
    if (!crons.length && !draft.webhookEnabled && !draft.githubEnabled) {
      setError("Add a cron, webhook, or GitHub trigger.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (creating) {
        await client.createRoutine({
          botId,
          name,
          prompt,
          crons,
          timezone: draft.timezone.trim() || "UTC",
          notify: draft.notify,
          active: draft.active,
          webhookEnabled: draft.webhookEnabled,
          githubEnabled: draft.githubEnabled,
        });
      } else if (editingId) {
        await client.patchRoutine({
          routineId: editingId,
          name,
          prompt,
          crons,
          timezone: draft.timezone.trim() || "UTC",
          notify: draft.notify,
          active: draft.active,
          webhookEnabled: draft.webhookEnabled,
          githubEnabled: draft.githubEnabled,
        });
      }
      cancelForm();
      await loadComputer(botId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const formOpen = creating || Boolean(editingId);

  return (
    <SidePanelChrome
      title="Routines"
      subtitle="schedules · create / update"
      actions={
        <Button
          size="sm"
          variant="outline"
          disabled={!botId || !client || busy || formOpen}
          onClick={openCreate}
        >
          New
        </Button>
      }
      padded={false}
      bodyClassName="flex min-h-0 flex-col overflow-hidden"
    >
      <div className="pica-scroll min-h-0 flex-1 space-y-2 overflow-auto px-5 pb-5">
        {loading && !computer ? <p className="text-xs text-[var(--color-muted)]">Loading…</p> : null}
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}

        {formOpen ? (
          <div className="space-y-2 rounded-xl border border-[var(--color-line)] p-3 dark:border-white/10">
            <p className="text-xs font-medium">
              {creating ? "Create routine" : "Edit routine"}
            </p>
            <label className="block space-y-1">
              <span className="text-[11px] text-[var(--color-muted)]">Name</span>
              <input
                className="w-full rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                maxLength={80}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-[var(--color-muted)]">Prompt</span>
              <textarea
                className="min-h-[72px] w-full rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
                value={draft.prompt}
                onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-[var(--color-muted)]">
                Cron (comma or newline; leave empty if webhook/GitHub only)
              </span>
              <input
                className="w-full rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:border-[var(--color-accent)]"
                value={draft.cron}
                onChange={(e) => setDraft((d) => ({ ...d, cron: e.target.value }))}
                placeholder="0 9 * * *"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-[var(--color-muted)]">Timezone</span>
              <input
                className="w-full rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
                value={draft.timezone}
                onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}
              />
            </label>
            <div className="flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
                />
                active
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={draft.notify}
                  onChange={(e) => setDraft((d) => ({ ...d, notify: e.target.checked }))}
                />
                notify
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={draft.webhookEnabled}
                  onChange={(e) => setDraft((d) => ({ ...d, webhookEnabled: e.target.checked }))}
                />
                webhook
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={draft.githubEnabled}
                  onChange={(e) => setDraft((d) => ({ ...d, githubEnabled: e.target.checked }))}
                />
                github
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button size="sm" disabled={busy} onClick={() => void saveForm()}>
                {creating ? "Create" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={cancelForm}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {(computer?.routines ?? []).length === 0 && !formOpen ? (
          <p className="text-xs text-[var(--color-muted)]">No routines for this bot.</p>
        ) : (
          computer?.routines.map((routine) => (
            <article
              key={routine.id}
              className="rounded-xl border border-[var(--color-line)] px-3 py-2 dark:border-white/10"
            >
              <p className="text-sm font-medium">{routine.name}</p>
              <p className="text-xs text-[var(--color-muted)]">{routine.human}</p>
              <p className="mt-1 font-mono text-[11px] text-[var(--color-muted)]">
                {routine.cron}
                {routine.mode === "watch" ? " · watch" : ""}
                {routine.enabled ? "" : " · paused"}
              </p>
              {routine.prompt ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-[var(--color-muted)]">
                  {routine.prompt}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || routine.editable === false}
                  onClick={() => openEdit(routine)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void act(routine, "run")}
                >
                  Run
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void loadHistory(routine.id)}
                >
                  History
                </Button>
                {routine.enabled ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void act(routine, "pause")}
                  >
                    Pause
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void act(routine, "resume")}
                  >
                    Resume
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy || routine.editable === false}
                  onClick={() => void act(routine, "delete")}
                >
                  Delete
                </Button>
              </div>
            </article>
          ))
        )}
      </div>

      {historyFor ? (
        <div className="mt-3 space-y-1 rounded-xl border border-[var(--color-line)] p-2.5">
          <p className="text-[11px] font-medium text-[var(--color-muted)]">
            routines.history · {historyFor}
          </p>
          {history.length === 0 ? (
            <p className="text-[11px] text-[var(--color-muted)]">No runs</p>
          ) : (
            <ul className="max-h-28 space-y-0.5 overflow-y-auto text-[11px]">
              {history.map((h, i) => (
                <li key={h.id ?? String(i)}>
                  {h.createdAt ?? "—"} · {h.status ?? "?"} · {h.id ?? ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </SidePanelChrome>
  );
}
