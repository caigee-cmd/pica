import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SidePanelBanner,
  SidePanelChrome,
  SidePanelEmpty,
  SidePanelIconButton,
} from "@/components/SidePanelChrome";
import { useConnection } from "@/stores/connection";
import { useWorkspace } from "@/stores/workspace";
import type { Board, Ticket, TicketComment, TicketStatus } from "@/types/gateway";

const COLUMNS: { id: TicketStatus; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "doing", label: "Doing" },
  { id: "review", label: "Review" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
  { id: "closed", label: "Closed" },
];

const FILTERS: { id: "all" | TicketStatus; label: string }[] = [
  { id: "all", label: "全部" },
  ...COLUMNS,
];

const field =
  "w-full rounded-xl border border-[var(--color-line)] bg-transparent px-2.5 py-1.5 text-[13px] outline-none dark:border-white/12";

function formatWhen(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  try {
    return new Date(t).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

export function BoardsPanel() {
  const client = useConnection((s) => s.client);
  const selection = useWorkspace((s) => s.selection);
  const bots = useWorkspace((s) => s.bots);
  const dmBotId = selection?.kind === "dm" ? selection.botId : undefined;

  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | TicketStatus>("all");
  const [boardName, setBoardName] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ticketEpoch, setTicketEpoch] = useState(0);

  const board = boards.find((b) => b.id === boardId) ?? null;
  const selected = tickets.find((t) => t.id === selectedId) ?? null;
  const assigneeDefault = dmBotId ?? bots[0]?.id ?? "";

  const visibleTickets = useMemo(() => {
    if (statusFilter === "all") return tickets;
    return tickets.filter((t) => (t.status ?? "todo") === statusFilter);
  }, [tickets, statusFilter]);

  const byStatus = useMemo(() => {
    const map: Record<TicketStatus, Ticket[]> = {
      todo: [],
      doing: [],
      review: [],
      blocked: [],
      done: [],
      closed: [],
    };
    for (const t of visibleTickets) {
      const st = (t.status ?? "todo") as TicketStatus;
      (map[st] ?? map.todo).push(t);
    }
    return map;
  }, [visibleTickets]);

  const ticketQuery = useCallback(
    (activeBoardId: string | null | undefined) => {
      const q: { boardId?: string; status?: TicketStatus } = {};
      if (activeBoardId) q.boardId = activeBoardId;
      if (statusFilter !== "all") q.status = statusFilter;
      return q;
    },
    [statusFilter],
  );

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [list, current] = await Promise.all([
        client.listBoards(),
        client.getBoard().catch(() => null),
      ]);
      setBoards(list);
      setBoardId((prev) => {
        const preferred =
          (prev && list.find((b) => b.id === prev)) ||
          current ||
          list[0] ||
          null;
        const nextId = preferred?.id ?? null;
        setBoardName(preferred?.name ?? "");
        return nextId;
      });
      setTicketEpoch((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载看板失败。");
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / client only
  }, [client]);

  useEffect(() => {
    if (!client) return;
    // Filter changes (and board switch after initial load) → tickets only.
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await client.listTickets(ticketQuery(boardId));
        if (!cancelled) {
          setTickets(rows);
          setSelectedId((prev) => (prev && rows.some((t) => t.id === prev) ? prev : null));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载工单失败。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, boardId, statusFilter, ticketQuery, ticketEpoch]);

  useEffect(() => {
    if (!client || !selectedId) {
      setComments([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await client.listTicketComments(selectedId);
        if (!cancelled) setComments(rows);
      } catch {
        if (!cancelled) setComments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, selectedId]);

  async function switchBoard(id: string) {
    const next = boards.find((b) => b.id === id);
    if (!next) return;
    setBoardId(id);
    setBoardName(next.name);
    setSelectedId(null);
    setNote(null);
  }

  async function rename() {
    if (!client || !boardName.trim()) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      // Contract: boards.rename is space-scoped (no boardId) — renames current space board.
      const updated = await client.renameBoard({ name: boardName.trim() });
      setBoards((prev) => {
        const i = prev.findIndex((b) => b.id === updated.id);
        if (i < 0) return [updated, ...prev];
        const next = [...prev];
        next[i] = updated;
        return next;
      });
      setBoardId(updated.id);
      setBoardName(updated.name);
      setNote("看板已重命名");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重命名失败。");
    } finally {
      setBusy(false);
    }
  }

  async function createTicket() {
    if (!client || !newTitle.trim() || !assigneeDefault) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const created = await client.createTicket({
        boardId: boardId ?? undefined,
        title: newTitle.trim(),
        assigneeBotId: assigneeDefault,
      });
      setTickets((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setNewTitle("");
      setNote(`已创建 · ${created.ref || created.id.slice(0, 8)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败。");
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, status: TicketStatus) {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await client.moveTicket({ id, status });
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "移动失败。");
    } finally {
      setBusy(false);
    }
  }

  async function saveSelected() {
    if (!client || !selected) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const updated = await client.updateTicket({
        id: selected.id,
        title: selected.title,
        description: selected.description ?? undefined,
        priority: selected.priority,
        status: selected.status,
        assigneeBotId: selected.assigneeBotId ?? undefined,
      });
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setNote("工单已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败。");
    } finally {
      setBusy(false);
    }
  }

  async function postComment() {
    if (!client || !selected || !commentBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const c = await client.commentTicket({ ticketId: selected.id, body: commentBody.trim() });
      setComments((prev) => [...prev, c]);
      setCommentBody("");
      setNote("评论已发送");
    } catch (err) {
      setError(err instanceof Error ? err.message : "评论失败。");
    } finally {
      setBusy(false);
    }
  }

  function patchSelected(patch: Partial<Ticket>) {
    if (!selectedId) return;
    setTickets((prev) => prev.map((t) => (t.id === selectedId ? { ...t, ...patch } : t)));
  }

  const columnsToShow =
    statusFilter === "all" ? COLUMNS : COLUMNS.filter((c) => c.id === statusFilter);

  return (
    <SidePanelChrome
      title={board?.name || "Boards"}
      subtitle={
        boards.length > 1
          ? `${boards.length} 看板 · tickets`
          : board?.ticketPrefix
            ? `前缀 ${board.ticketPrefix} · tickets`
            : "Tickets · kanban"
      }
      actions={
        <SidePanelIconButton label="刷新" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </SidePanelIconButton>
      }
      padded={false}
      bodyClassName="flex min-h-0 flex-col overflow-hidden"
    >
      <div className="space-y-2 px-5 pb-2.5">
        {boards.length > 1 ? (
          <label className="block text-[11px] text-[var(--color-muted)]">
            看板
            <select
              className={`${field} mt-1`}
              value={boardId ?? ""}
              onChange={(e) => void switchBoard(e.target.value)}
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.ticketPrefix ? ` (${b.ticketPrefix})` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex gap-2">
          <input
            className={`${field} min-w-0 flex-1`}
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            placeholder="看板名称"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[13px]"
            disabled={busy || !boardName.trim()}
            onClick={() => void rename()}
          >
            重命名
          </Button>
        </div>

        <div className="flex gap-2">
          <input
            className={`${field} min-w-0 flex-1`}
            placeholder={assigneeDefault ? "新工单标题…" : "需要可指派的 Bot"}
            value={newTitle}
            disabled={!assigneeDefault}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createTicket();
            }}
          />
          <Button
            size="sm"
            className="h-8 gap-1 text-[13px]"
            disabled={busy || !newTitle.trim() || !assigneeDefault}
            onClick={() => void createTicket()}
          >
            <Plus className="size-3.5" /> 工单
          </Button>
        </div>

        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const active = statusFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "bg-zinc-100 text-[var(--color-muted)] hover:text-zinc-800 dark:bg-white/8 dark:hover:text-zinc-100"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {error ? <SidePanelBanner tone="danger">{error}</SidePanelBanner> : null}
        {note ? <SidePanelBanner>{note}</SidePanelBanner> : null}
      </div>

      {boards.length === 0 && !loading ? (
        <SidePanelEmpty className="text-[13px]">暂无看板</SidePanelEmpty>
      ) : (
        <div className="flex min-h-0 flex-1 border-t border-[var(--color-line)] dark:border-white/10">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto p-2.5">
            {columnsToShow.map((col) => (
              <div
                key={col.id}
                className="flex w-[9.5rem] shrink-0 flex-col rounded-2xl bg-zinc-50/90 dark:bg-white/[0.04]"
              >
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-[11px] font-semibold tracking-wider text-[var(--color-muted)] uppercase">
                    {col.label}
                  </span>
                  <span className="text-[10px] tabular-nums text-[var(--color-muted)]">
                    {byStatus[col.id].length}
                  </span>
                </div>
                <div className="flex flex-col gap-1 overflow-y-auto px-1.5 pb-2">
                  {byStatus[col.id].length === 0 ? (
                    <p className="px-1.5 py-3 text-center text-[11px] text-[var(--color-muted)]">空</p>
                  ) : null}
                  {byStatus[col.id].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`rounded-xl px-2 py-1.5 text-left transition ${
                        selectedId === t.id
                          ? "bg-white shadow-sm dark:bg-white/12"
                          : "bg-white/70 hover:bg-white dark:bg-white/[0.06] dark:hover:bg-white/10"
                      }`}
                    >
                      <p className="text-[13px] font-medium leading-snug text-zinc-900 dark:text-zinc-50">
                        {t.title}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">
                        {t.ref || t.id.slice(0, 8)}
                        {t.priority && t.priority !== "normal" ? ` · ${t.priority}` : ""}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex w-[15.5rem] shrink-0 flex-col border-l border-[var(--color-line)] dark:border-white/10">
            {selected ? (
              <>
                <div className="space-y-2 overflow-y-auto border-b border-[var(--color-line)] p-2.5 dark:border-white/10">
                  <input
                    className={field}
                    value={selected.title}
                    onChange={(e) => patchSelected({ title: e.target.value })}
                  />
                  <textarea
                    className={`${field} min-h-[64px] resize-none`}
                    placeholder="描述"
                    value={selected.description ?? ""}
                    onChange={(e) => patchSelected({ description: e.target.value })}
                  />
                  <label className="block text-[11px] text-[var(--color-muted)]">
                    状态
                    <select
                      className={`${field} mt-1`}
                      value={selected.status ?? "todo"}
                      onChange={(e) => {
                        const status = e.target.value as TicketStatus;
                        patchSelected({ status });
                        void move(selected.id, status);
                      }}
                    >
                      {COLUMNS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[11px] text-[var(--color-muted)]">
                    优先级
                    <select
                      className={`${field} mt-1`}
                      value={selected.priority ?? "normal"}
                      onChange={(e) =>
                        patchSelected({
                          priority: e.target.value as Ticket["priority"],
                        })
                      }
                    >
                      <option value="low">low</option>
                      <option value="normal">normal</option>
                      <option value="high">high</option>
                      <option value="urgent">urgent</option>
                    </select>
                  </label>
                  {bots.length > 0 ? (
                    <label className="block text-[11px] text-[var(--color-muted)]">
                      指派
                      <select
                        className={`${field} mt-1`}
                        value={selected.assigneeBotId ?? ""}
                        onChange={(e) =>
                          patchSelected({ assigneeBotId: e.target.value || null })
                        }
                      >
                        <option value="">未指派</option>
                        {bots.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <Button
                    size="sm"
                    className="h-7 w-full text-[13px]"
                    disabled={busy}
                    onClick={() => void saveSelected()}
                  >
                    保存工单
                  </Button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-medium text-[var(--color-muted)]">
                    <MessageSquare className="size-3.5" /> 评论
                  </div>
                  <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2.5 pb-2">
                    {comments.length === 0 ? (
                      <SidePanelEmpty className="py-4 text-[13px]">暂无评论</SidePanelEmpty>
                    ) : null}
                    {comments.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-xl bg-zinc-50 px-2 py-1.5 text-[12px] dark:bg-white/5"
                      >
                        {typeof c.authorName === "string" && c.authorName ? (
                          <p className="text-[10px] font-medium text-[var(--color-muted)]">
                            {c.authorName}
                          </p>
                        ) : null}
                        <p className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">{c.body}</p>
                        {c.createdAt ? (
                          <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">
                            {formatWhen(c.createdAt)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5 border-t border-[var(--color-line)] p-2 dark:border-white/10">
                    <input
                      className={`${field} min-w-0 flex-1 text-[12px]`}
                      placeholder="添加评论…"
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void postComment();
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-7 text-[13px]"
                      disabled={busy || !commentBody.trim()}
                      onClick={() => void postComment()}
                    >
                      发送
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <SidePanelEmpty className="text-[13px]">选择工单</SidePanelEmpty>
            )}
          </div>
        </div>
      )}
    </SidePanelChrome>
  );
}
