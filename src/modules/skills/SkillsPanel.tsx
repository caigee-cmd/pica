import { useCallback, useEffect, useState } from "react";
import { Play, Plus, RefreshCw, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SidePanelBanner,
  SidePanelChrome,
  SidePanelEmpty,
  SidePanelIconButton,
  SidePanelRow,
  SidePanelTabs,
} from "@/components/SidePanelChrome";
import { useConnection } from "@/stores/connection";
import { useWorkspace } from "@/stores/workspace";
import type { AgentSkill, TaughtSkill } from "@/types/gateway";

type Tab = "taught" | "agent";

const field =
  "w-full rounded-xl border border-[var(--color-line)] bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:border-zinc-400 dark:border-white/12 dark:focus:border-zinc-500";

function statusLabel(status?: string): string {
  if (!status) return "—";
  const map: Record<string, string> = {
    recording: "录制中",
    drafting: "起草中",
    draft: "草稿",
    saved: "已保存",
  };
  return map[status] ?? status;
}

export function SkillsPanel() {
  const client = useConnection((s) => s.client);
  const selection = useWorkspace((s) => s.selection);
  const botId = selection?.kind === "dm" ? selection.botId : undefined;

  const [tab, setTab] = useState<Tab>("taught");
  const [taught, setTaught] = useState<TaughtSkill[]>([]);
  const [agent, setAgent] = useState<AgentSkill[]>([]);
  const [selectedTaughtId, setSelectedTaughtId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentDesc, setAgentDesc] = useState("");
  const [agentBody, setAgentBody] = useState("");
  const [testPrompt, setTestPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const selectedTaught = taught.find((s) => s.id === selectedTaughtId) ?? null;
  const selectedAgent = agent.find((s) => s.id === selectedAgentId) ?? null;
  const taughtRecording = selectedTaught?.status === "recording";
  const taughtDraft =
    selectedTaught?.status === "draft" || selectedTaught?.status === "drafting";

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [tRows, aRows] = await Promise.all([
        botId ? client.listTaughtSkills(botId) : Promise.resolve([] as TaughtSkill[]),
        client.listAgentSkills().catch(() => [] as AgentSkill[]),
      ]);
      setTaught(tRows);
      setAgent(aRows);
      if (selectedTaughtId && !tRows.some((s) => s.id === selectedTaughtId)) {
        setSelectedTaughtId(null);
      }
      if (selectedAgentId && !aRows.some((s) => s.id === selectedAgentId)) {
        setSelectedAgentId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载技能失败。");
    } finally {
      setLoading(false);
    }
  }, [client, botId, selectedTaughtId, selectedAgentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedAgent) {
      setAgentName("");
      setAgentDesc("");
      setAgentBody("");
      return;
    }
    setAgentName(selectedAgent.name ?? "");
    setAgentDesc(selectedAgent.description ?? "");
    setAgentBody(selectedAgent.body ?? selectedAgent.content ?? "");
  }, [selectedAgent?.id]);

  function upsertTaught(full: TaughtSkill) {
    setTaught((prev) => {
      const i = prev.findIndex((s) => s.id === full.id);
      if (i < 0) return [full, ...prev];
      const next = [...prev];
      next[i] = full;
      return next;
    });
  }

  async function startTaught() {
    if (!client || !botId || !goal.trim()) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const created = await client.startTaughtSkill({ botId, goal: goal.trim() });
      upsertTaught(created);
      setSelectedTaughtId(created.id);
      setGoal("");
      setNote(`已开始 · ${created.name || created.id.slice(0, 8)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "开始失败。");
    } finally {
      setBusy(false);
    }
  }

  async function stopTaught() {
    if (!client || !selectedTaught) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const updated = await client.stopTaughtSkill(selectedTaught.id);
      upsertTaught(updated);
      setNote(`已停止 · ${statusLabel(updated.status)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "停止失败。");
    } finally {
      setBusy(false);
    }
  }

  async function saveTaught() {
    if (!client || !selectedTaught) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const updated = await client.saveTaughtSkill({ skillId: selectedTaught.id });
      upsertTaught(updated);
      setNote(`已保存 · ${updated.name || updated.id.slice(0, 8)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function testRun() {
    if (!client || !selectedTaught) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await client.testRunTaughtSkill({
        skillId: selectedTaught.id,
        prompt: testPrompt.trim() || undefined,
      });
      setNote(`testRun · ${res.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "testRun 失败。");
    } finally {
      setBusy(false);
    }
  }

  async function removeTaught(id: string) {
    if (!client) return;
    if (!window.confirm("删除该 Taught skill？")) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await client.removeTaughtSkill(id);
      setTaught((prev) => prev.filter((s) => s.id !== id));
      if (selectedTaughtId === id) setSelectedTaughtId(null);
      setNote("已删除 Taught skill");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败。");
    } finally {
      setBusy(false);
    }
  }

  async function createAgent() {
    if (!client || !agentName.trim()) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const created = await client.createAgentSkill({
        name: agentName.trim(),
        description: agentDesc.trim() || agentName.trim(),
        body: agentBody,
      });
      setAgent((prev) => [created, ...prev]);
      setSelectedAgentId(created.id);
      setNote(`已创建 · ${created.name}`);
      setTab("agent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败。");
    } finally {
      setBusy(false);
    }
  }

  async function saveAgent() {
    if (!client || !selectedAgent) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const updated = await client.updateAgentSkill({
        skillId: selectedAgent.id,
        name: agentName.trim() || selectedAgent.name,
        description: agentDesc,
        body: agentBody,
      });
      setAgent((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setNote("已保存 Agent skill");
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败。");
    } finally {
      setBusy(false);
    }
  }

  async function removeAgent(id: string) {
    if (!client) return;
    if (!window.confirm("删除该 Agent skill？")) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await client.removeAgentSkill(id);
      setAgent((prev) => prev.filter((s) => s.id !== id));
      if (selectedAgentId === id) {
        setSelectedAgentId(null);
        setAgentName("");
        setAgentDesc("");
        setAgentBody("");
      }
      setNote("已删除 Agent skill");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败。");
    } finally {
      setBusy(false);
    }
  }

  async function openGet(kind: Tab, id: string) {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "taught") {
        const full = await client.getTaughtSkill(id);
        upsertTaught(full);
        setSelectedTaughtId(id);
        setTab("taught");
      } else {
        const full = await client.getAgentSkill({ skillId: id });
        setAgent((prev) => {
          const i = prev.findIndex((s) => s.id === id);
          if (i < 0) return [full, ...prev];
          const next = [...prev];
          next[i] = full;
          return next;
        });
        setSelectedAgentId(id);
        setTab("agent");
        setAgentName(full.name ?? "");
        setAgentDesc(full.description ?? "");
        setAgentBody(full.body ?? full.content ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SidePanelChrome
      title="Skills"
      subtitle="Taught · agentSkills"
      actions={
        <SidePanelIconButton label="刷新" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </SidePanelIconButton>
      }
      bodyClassName="flex min-h-0 flex-col"
    >
      <SidePanelTabs
        value={tab}
        onChange={(next) => {
          setTab(next);
          setNote(null);
        }}
        items={[
          { id: "taught", label: `Taught (${taught.length})` },
          { id: "agent", label: `Agent (${agent.length})` },
        ]}
      />

      {error ? <SidePanelBanner tone="danger">{error}</SidePanelBanner> : null}
      {note ? <SidePanelBanner>{note}</SidePanelBanner> : null}

      {tab === "taught" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5">
          <div className="flex gap-2">
            <input
              className={`${field} min-w-0 flex-1`}
              placeholder={botId ? "新 Taught skill 目标…" : "请先选择 Bot DM"}
              value={goal}
              disabled={!botId}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void startTaught();
              }}
            />
            <Button
              size="sm"
              className="h-8 shrink-0 gap-1 text-[13px]"
              disabled={!botId || busy || !goal.trim()}
              onClick={() => void startTaught()}
            >
              <Plus className="size-3.5" /> 开始
            </Button>
          </div>
          {!botId ? (
            <p className="text-[11px] text-[var(--color-muted)]">Taught skills 绑定当前 Bot DM。</p>
          ) : null}
          <div className="flex min-h-0 flex-1 gap-2">
            <div className="w-[10rem] shrink-0 space-y-0.5 overflow-y-auto">
              {taught.length === 0 && !loading ? (
                <SidePanelEmpty className="py-6 text-[13px]">
                  {botId ? "暂无 Taught skills" : "选择 Bot DM"}
                </SidePanelEmpty>
              ) : null}
              {taught.map((s) => (
                <SidePanelRow
                  key={s.id}
                  dense
                  active={selectedTaughtId === s.id}
                  onClick={() => void openGet("taught", s.id)}
                  title={s.name || s.goal || s.id.slice(0, 8)}
                  subtitle={statusLabel(s.status)}
                />
              ))}
            </div>
            <div className="min-w-0 flex-1 space-y-2.5 rounded-2xl bg-zinc-50/80 p-2.5 dark:bg-white/5">
              {selectedTaught ? (
                <>
                  <div>
                    <p className="text-[13.5px] font-medium text-zinc-900 dark:text-zinc-50">
                      {selectedTaught.name || selectedTaught.id}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-[12px] leading-snug text-[var(--color-muted)]">
                      {selectedTaught.goal}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                      状态 · {statusLabel(selectedTaught.status)}
                    </p>
                  </div>
                  <input
                    className={field}
                    placeholder="可选 test prompt…"
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {taughtRecording ? (
                      <Button size="sm" className="h-7 gap-1 text-[13px]" disabled={busy} onClick={() => void stopTaught()}>
                        <Square className="size-3" /> 停止
                      </Button>
                    ) : null}
                    {taughtDraft ? (
                      <Button size="sm" className="h-7 text-[13px]" disabled={busy} onClick={() => void saveTaught()}>
                        保存
                      </Button>
                    ) : null}
                    <Button size="sm" className="h-7 gap-1 text-[13px]" disabled={busy} onClick={() => void testRun()}>
                      <Play className="size-3.5" /> testRun
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      className="h-7"
                      disabled={busy}
                      onClick={() => void removeTaught(selectedTaught.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <SidePanelEmpty className="py-6 text-[13px]">选择 Taught skill</SidePanelEmpty>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-2">
          <div className="w-[10rem] shrink-0 space-y-0.5 overflow-y-auto">
            {agent.length === 0 && !loading ? (
              <SidePanelEmpty className="py-6 text-[13px]">暂无 Agent skills</SidePanelEmpty>
            ) : null}
            {agent.map((s) => (
              <SidePanelRow
                key={s.id}
                dense
                active={selectedAgentId === s.id}
                onClick={() => void openGet("agent", s.id)}
                title={s.name}
                subtitle={s.description || s.id.slice(0, 8)}
              />
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input className={field} placeholder="名称" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
            <input
              className={field}
              placeholder="描述"
              value={agentDesc}
              onChange={(e) => setAgentDesc(e.target.value)}
            />
            <textarea
              className={`${field} min-h-[120px] flex-1 resize-none font-mono text-[12px] leading-relaxed`}
              placeholder="Body / playbook markdown…"
              value={agentBody}
              onChange={(e) => setAgentBody(e.target.value)}
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-1.5">
              {selectedAgent ? (
                <>
                  <Button size="sm" className="h-7 text-[13px]" disabled={busy} onClick={() => void saveAgent()}>
                    更新
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    className="h-7"
                    disabled={busy}
                    onClick={() => void removeAgent(selectedAgent.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[13px]"
                    disabled={busy}
                    onClick={() => {
                      setSelectedAgentId(null);
                      setAgentName("");
                      setAgentDesc("");
                      setAgentBody("");
                      setNote(null);
                    }}
                  >
                    新建
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="h-7 gap-1 text-[13px]"
                  disabled={busy || !agentName.trim()}
                  onClick={() => void createAgent()}
                >
                  <Plus className="size-3.5" /> 创建
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </SidePanelChrome>
  );
}
