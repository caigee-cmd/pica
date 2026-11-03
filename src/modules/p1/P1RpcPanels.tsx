import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/stores/connection";
import { useWorkspace } from "@/stores/workspace";
import type {
  AgentSkill,
  AppConnection,
  ArtifactListItem,
  Board,
  CapabilityInstall,
  McpServer,
  MemoryDocument,
  RunActivityRow,
  TaughtSkill,
  Ticket,
} from "@/types/gateway";

/**
 * Minimal P1 surfaces: list/refresh key RPC families.
 * Full editors can grow later; this proves wire + auth paths.
 */
export function P1RpcPanels() {
  const client = useConnection((s) => s.client);
  const selection = useWorkspace((s) => s.selection);
  const botId = selection?.kind === "dm" ? selection.botId : undefined;

  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [memories, setMemories] = useState<MemoryDocument[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [taught, setTaught] = useState<TaughtSkill[]>([]);
  const [agentSkills, setAgentSkills] = useState<AgentSkill[]>([]);
  const [mcp, setMcp] = useState<McpServer[]>([]);
  const [connections, setConnections] = useState<AppConnection[]>([]);
  const [caps, setCaps] = useState<CapabilityInstall[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([]);
  const [runs, setRuns] = useState<RunActivityRow[]>([]);
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
  );

  const run = async (label: string, fn: () => Promise<void>) => {
    if (!client || busy) return;
    setBusy(true);
    setDetail(null);
    try {
      await fn();
      setDetail(`${label} ok`);
    } catch (err) {
      setDetail(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 border-t border-[var(--color-line)] pt-5">
      <div>
        <p className="text-sm font-medium text-[var(--color-ink)] dark:text-zinc-100">P1 RPC</p>
        <p className="text-xs text-[var(--color-muted)]">
          memory · boards/tickets · skills/agentSkills · mcp/connections/capabilities · artifacts ·
          runs · preferences（最小列表/刷新）
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client}
          onClick={() =>
            void run("memory.list", async () => {
              setMemories(await client!.listMemoryDocuments(botId ? { botId } : {}));
            })
          }
        >
          Memory
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client}
          onClick={() =>
            void run("boards+tickets", async () => {
              setBoards(await client!.listBoards());
              setTickets(await client!.listTickets({}));
            })
          }
        >
          Board
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client || !botId}
          onClick={() =>
            void run("skills.list", async () => {
              setTaught(await client!.listTaughtSkills(botId!));
            })
          }
        >
          Skills
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client}
          onClick={() =>
            void run("agentSkills.list", async () => {
              setAgentSkills(await client!.listAgentSkills());
            })
          }
        >
          Agent skills
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client}
          onClick={() =>
            void run("mcp+conn+caps", async () => {
              setMcp(await client!.listMcpServers());
              setConnections(await client!.listConnections());
              setCaps(await client!.listCapabilities());
            })
          }
        >
          MCP / conn / caps
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client || !botId}
          onClick={() =>
            void run("artifacts.list", async () => {
              setArtifacts(await client!.listArtifacts(botId!));
            })
          }
        >
          Artifacts
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !client}
          onClick={() =>
            void run("runs.list", async () => {
              setRuns(await client!.listRuns("recent"));
            })
          }
        >
          Runs
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-[var(--color-muted)]">
          Timezone
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-8 rounded-lg border border-[var(--color-line)] bg-transparent px-2 text-xs text-[var(--color-ink)]"
          />
        </label>
        <Button
          size="sm"
          disabled={busy || !client || !timezone.trim()}
          onClick={() =>
            void run("preferences.update", async () => {
              await client!.updatePreferences({ timezone: timezone.trim() });
            })
          }
        >
          Save prefs
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !client || !timezone.trim()}
          onClick={() =>
            void run("preferences.adoptTimezone", async () => {
              await client!.adoptTimezone(timezone.trim());
            })
          }
        >
          Adopt TZ
        </Button>
      </div>

      <MiniList
        title={`Memory (${memories.length})`}
        rows={memories.map((m) => `${m.title || m.id} · rev ${m.revision ?? "?"}`)}
      />
      <MiniList
        title={`Boards (${boards.length}) / tickets (${tickets.length})`}
        rows={[
          ...boards.map((b) => `board ${b.name || b.id}`),
          ...tickets.slice(0, 8).map((t) => `${t.ref || t.id}: ${t.title} [${t.status ?? ""}]`),
        ]}
      />
      <MiniList
        title={`Taught skills (${taught.length})`}
        rows={taught.map((s) => `${s.name || s.id} · ${s.status ?? ""}`)}
      />
      <MiniList
        title={`Agent skills (${agentSkills.length})`}
        rows={agentSkills.map((s) => `${s.name} — ${(s.description || "").slice(0, 60)}`)}
      />
      <MiniList
        title={`MCP (${mcp.length}) · connections (${connections.length}) · caps (${caps.length})`}
        rows={[
          ...mcp.map((s) => `mcp ${s.name}`),
          ...connections.map((c) => `conn ${c.displayName || c.id}`),
          ...caps.map((c) => `cap ${c.name || c.id}`),
        ]}
      />
      <MiniList
        title={`Artifacts (${artifacts.length})`}
        rows={artifacts.map((a) => `${a.name || a.id} · ${a.mimeType || ""}`)}
      />
      <MiniList
        title={`Runs (${runs.length})`}
        rows={runs.map((r) => `${r.id} · ${r.status ?? ""} · ${r.createdAt ?? ""}`)}
      />

      {detail ? (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
          {detail}
        </p>
      ) : null}
      {!botId ? (
        <p className="text-[11px] text-[var(--color-muted)]">
          打开某个 bot 的 DM 后可刷 memory / taught skills / artifacts（需要 botId）。
        </p>
      ) : null}
    </section>
  );
}

function MiniList({ title, rows }: { title: string; rows: string[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
        {title}
      </p>
      <ul className="max-h-28 space-y-0.5 overflow-y-auto rounded-xl border border-[var(--color-line)] px-2.5 py-2 text-[11px]">
        {rows.map((row, i) => (
          <li key={`${i}-${row.slice(0, 24)}`} className="truncate text-[var(--color-ink)]">
            {row}
          </li>
        ))}
      </ul>
    </div>
  );
}
