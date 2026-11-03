import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Trash2 } from "lucide-react";
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
import type { MemoryBudget, MemoryDocument } from "@/types/gateway";

type Scope = "bot" | "user";

const MEMORY_INDEX = "MEMORY.md";

function docLabel(d: MemoryDocument): string {
  return d.path || d.title || d.id.slice(0, 8);
}

function isDeletable(d: MemoryDocument): boolean {
  const path = d.path || d.title || "";
  return path !== MEMORY_INDEX;
}

function formatUpdated(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  try {
    return new Date(t).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

function budgetLine(budget: MemoryBudget | null): string | null {
  if (!budget) return null;
  const used = Number(budget.usedBytes ?? budget.used ?? 0);
  const limit = budget.limitBytes ?? budget.limit;
  const pct =
    typeof budget.percentUsed === "number"
      ? Math.round(budget.percentUsed)
      : limit
        ? Math.round((used / Number(limit)) * 100)
        : null;
  const docs = Array.isArray(budget.documents) ? budget.documents.length : null;
  const omitted = Array.isArray(budget.omitted) ? budget.omitted.length : null;
  const parts = [
    `预算 · ${used.toLocaleString()}${limit != null ? ` / ${Number(limit).toLocaleString()} B` : " B"}`,
  ];
  if (pct != null) parts.push(`${pct}%`);
  if (docs != null) parts.push(`提示内 ${docs}`);
  if (omitted) parts.push(`省略 ${omitted}`);
  return parts.join(" · ");
}

export function MemoryPanel() {
  const client = useConnection((s) => s.client);
  const selection = useWorkspace((s) => s.selection);
  const botId = selection?.kind === "dm" ? selection.botId : undefined;

  const [scope, setScope] = useState<Scope>("bot");
  const [docs, setDocs] = useState<MemoryDocument[]>([]);
  const [budget, setBudget] = useState<MemoryBudget | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [revision, setRevision] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const selected = docs.find((d) => d.id === selectedId) ?? null;
  const canLoadBot = Boolean(botId);
  const canLoad = scope === "user" || canLoadBot;
  const dirty = selected ? draft !== (selected.content ?? "") : false;

  const sorted = useMemo(() => {
    return [...docs].sort((a, b) => {
      const ap = a.path || a.title || a.id;
      const bp = b.path || b.title || b.id;
      if (ap === MEMORY_INDEX) return -1;
      if (bp === MEMORY_INDEX) return 1;
      return ap.localeCompare(bp);
    });
  }, [docs]);

  const load = useCallback(async () => {
    if (!client) return;
    if (scope === "bot" && !botId) {
      setDocs([]);
      setBudget(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const listInput =
        scope === "bot" ? { botId: botId!, scope: "bot" as const } : { botId, scope: "user" as const };
      const [list, bud] = await Promise.all([
        client.listMemoryDocuments(listInput),
        botId ? client.memoryBudget(botId).catch(() => null) : Promise.resolve(null),
      ]);
      setDocs(list);
      setBudget(bud);
      if (selectedId && !list.some((d) => d.id === selectedId)) {
        setSelectedId(null);
        setDraft("");
        setRevision(undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载记忆失败。");
    } finally {
      setLoading(false);
    }
  }, [client, botId, scope, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!botId && scope === "bot") setScope("user");
  }, [botId, scope]);

  useEffect(() => {
    if (!selected) {
      setDraft("");
      setRevision(undefined);
      return;
    }
    setDraft(selected.content ?? "");
    setRevision(selected.revision);
  }, [selected?.id, selected?.revision, selected?.content]);

  async function save() {
    if (!client || !selected) return;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const updated = await client.updateMemoryDocument({
        documentId: selected.id,
        content: draft,
        expectedRevision: revision,
      });
      setDocs((prev) => prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
      setRevision(updated.revision);
      setDraft(updated.content ?? draft);
      setNote("已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function removeDoc(id: string) {
    if (!client) return;
    const doc = docs.find((d) => d.id === id);
    if (doc && !isDeletable(doc)) {
      setError("MEMORY.md 索引不可删除");
      return;
    }
    if (!window.confirm("删除该记忆文档？")) return;
    setError(null);
    setNote(null);
    try {
      await client.removeMemoryDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setDraft("");
      }
      setNote("已删除");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败。");
    }
  }

  async function exportMd() {
    if (!client) return;
    setError(null);
    setNote(null);
    try {
      const raw = await client.exportMemoryMarkdown(botId);
      const text =
        typeof raw === "string"
          ? raw
          : typeof (raw as { markdown?: string })?.markdown === "string"
            ? (raw as { markdown: string }).markdown
            : JSON.stringify(raw, null, 2);
      await navigator.clipboard.writeText(text);
      setNote("Markdown 已复制到剪贴板");
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出失败。");
    }
  }

  return (
    <SidePanelChrome
      title="Memory"
      subtitle={scope === "bot" ? "Bot scope · budget · docs" : "Account scope · docs"}
      actions={
        <>
          <SidePanelIconButton label="刷新" disabled={loading || !canLoad} onClick={() => void load()}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </SidePanelIconButton>
          <SidePanelIconButton label="导出 Markdown" disabled={!client} onClick={() => void exportMd()}>
            <Download className="size-3.5" />
          </SidePanelIconButton>
        </>
      }
      padded={false}
      bodyClassName="flex min-h-0 flex-col overflow-hidden"
    >
      <div className="space-y-2 px-5 pb-2">
        <SidePanelTabs
          value={scope}
          onChange={(next) => {
            setScope(next);
            setSelectedId(null);
            setNote(null);
          }}
          items={[
            { id: "bot", label: "Bot" },
            { id: "user", label: "Account" },
          ]}
        />
        {scope === "bot" && !botId ? (
          <SidePanelBanner>选择 Bot DM 以查看 bot 范围记忆</SidePanelBanner>
        ) : null}
        {budgetLine(budget) ? (
          <p className="text-[11px] leading-snug text-[var(--color-muted)]">{budgetLine(budget)}</p>
        ) : botId && scope === "bot" && !loading ? (
          <p className="text-[11px] leading-snug text-[var(--color-muted)]">预算不可用或为空</p>
        ) : null}
        <p className="text-[11px] leading-snug text-[var(--color-muted)]">
          无 create RPC；文档由助手写入，此处可编辑 / 删除 / 导出。
        </p>
        {error ? <SidePanelBanner tone="danger">{error}</SidePanelBanner> : null}
        {note ? <SidePanelBanner>{note}</SidePanelBanner> : null}
      </div>

      {!canLoad ? (
        <SidePanelEmpty className="text-[13px]">选择 Bot DM，或切换到 Account scope。</SidePanelEmpty>
      ) : (
        <div className="flex min-h-0 flex-1 border-t border-[var(--color-line)] dark:border-white/10">
          <div className="w-[10.5rem] shrink-0 space-y-0.5 overflow-y-auto p-1.5">
            {sorted.length === 0 && !loading ? (
              <SidePanelEmpty className="py-6 text-[13px]">暂无文档</SidePanelEmpty>
            ) : null}
            {sorted.map((d) => (
              <SidePanelRow
                key={d.id}
                dense
                active={selectedId === d.id}
                onClick={() => setSelectedId(d.id)}
                title={docLabel(d)}
                subtitle={`rev ${d.revision ?? "—"} · ${d.scope ?? scope}`}
              />
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col border-l border-[var(--color-line)] dark:border-white/10">
            {selected ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-zinc-900 dark:text-zinc-50">
                      {docLabel(selected)}
                    </p>
                    <p className="truncate text-[11px] text-[var(--color-muted)]">
                      {selected.scope ?? scope}
                      {selected.updatedAt ? ` · ${formatUpdated(selected.updatedAt)}` : ""}
                      {dirty ? " · 未保存" : ""}
                    </p>
                  </div>
                  {isDeletable(selected) ? (
                    <Button
                      size="sm"
                      variant="danger"
                      className="h-7 px-2"
                      onClick={() => void removeDoc(selected.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : null}
                  <Button size="sm" className="h-7 text-[13px]" onClick={() => void save()} disabled={saving || !dirty}>
                    {saving ? "保存中…" : "保存"}
                  </Button>
                </div>
                <textarea
                  className="min-h-0 flex-1 resize-none bg-transparent px-3 pb-4 font-mono text-[13px] leading-relaxed text-zinc-800 outline-none dark:text-zinc-100"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                />
              </>
            ) : (
              <SidePanelEmpty className="text-[13px]">选择文档进行编辑</SidePanelEmpty>
            )}
          </div>
        </div>
      )}
    </SidePanelChrome>
  );
}
