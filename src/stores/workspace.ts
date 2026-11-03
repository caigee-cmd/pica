import { create } from "zustand";
import type { GatewayClient } from "@/lib/gateway";
import { loadConfig } from "@/lib/config";
import {
  loadDrafts,
  loadRoster,
  saveDrafts,
  saveRoster,
} from "@/lib/localCache";
import { messageFromProductEvent, statusFromProductEvent } from "@/lib/rakazoMap";
import { compareMessagesChronological, ensureOldestFirst } from "@/lib/messageOrder";
import { subscribeThread } from "@/lib/stream";
import { emitProductEvent, useConnection } from "@/stores/connection";
import type {
  Bot,
  BotStatus,
  ComputerInfo,
  Group,
  Message,
  ProductEvent,
  SendMessageInput,
  ThreadTarget,
} from "@/types/gateway";

export type ComposerReply = {
  messageId: string;
  author: string;
  preview: string;
};

export type Selection =
  | { kind: "dm"; botId: string; threadId: string }
  | { kind: "group"; groupId: string; threadId: string }
  | null;

function gatewayBaseUrl(): string {
  return useConnection.getState().config.baseUrl || loadConfig().baseUrl;
}

function persistRoster(state: { bots: Bot[]; groups: Group[] }) {
  const baseUrl = gatewayBaseUrl();
  if (!baseUrl) return;
  saveRoster(baseUrl, { bots: state.bots, groups: state.groups });
}

let draftPersistTimer: ReturnType<typeof setTimeout> | null = null;

function persistDraftsSoon(drafts: Record<string, string>) {
  const baseUrl = gatewayBaseUrl();
  if (!baseUrl) return;
  if (draftPersistTimer) clearTimeout(draftPersistTimer);
  draftPersistTimer = setTimeout(() => {
    draftPersistTimer = null;
    saveDrafts(baseUrl, drafts);
  }, 250);
}

function persistDraftsNow(drafts: Record<string, string>) {
  const baseUrl = gatewayBaseUrl();
  if (!baseUrl) return;
  if (draftPersistTimer) {
    clearTimeout(draftPersistTimer);
    draftPersistTimer = null;
  }
  saveDrafts(baseUrl, drafts);
}

function initialFromCache() {
  const baseUrl = loadConfig().baseUrl;
  const roster = loadRoster(baseUrl);
  const drafts = loadDrafts(baseUrl);
  return {
    bots: roster?.bots ?? [],
    groups: roster?.groups ?? [],
    composerDrafts: drafts,
  };
}

function selectionTarget(selection: NonNullable<Selection>): ThreadTarget {
  if (selection.kind === "dm") return { botId: selection.botId };
  return { groupId: selection.groupId };
}

function upsertMessage(list: Message[] | undefined, message: Message): Message[] {
  const current = list ?? [];
  const index = current.findIndex((item) => item.id === message.id);
  const next =
    index === -1
      ? [...current, message]
      : current.map((item, i) => (i === index ? { ...item, ...message } : item));
  // Always re-sort: updates may fill seq after an optimistic/created_at-only row.
  return next.sort(compareMessagesChronological);
}

type WorkspaceStore = {
  bots: Bot[];
  groups: Group[];
  statuses: Record<string, BotStatus>;
  seenDone: Record<string, boolean>;
  messages: Record<string, Message[]>;
  cursors: Record<string, number>;
  loadingThread: string | null;
  selection: Selection;
  panel: "none" | "computer" | "routines" | "memory" | "skills" | "boards" | "call";
  computer: ComputerInfo | null;
  computerLoading: boolean;
  error: string | null;
  composerDrafts: Record<string, string>;
  composerReplies: Record<string, ComposerReply>;
  streamingIds: string[];
  finishStreaming: (id: string) => void;
  refreshRoster: () => Promise<void>;
  openBot: (botId: string) => Promise<void>;
  openGroup: (groupId: string) => Promise<void>;
  startChatWithAgents: (botIds: string[]) => Promise<{ localStub: boolean }>;
  loadThread: (selection: NonNullable<Selection>) => Promise<void>;
  clearThreadHistory: () => Promise<void>;
  markThreadUnread: (messageId?: string) => Promise<void>;
  reactToMessage: (
    messageId: string,
    reaction: import("@/types/gateway").MessageReaction,
  ) => Promise<void>;
  archiveBotRemote: (botId: string) => Promise<void>;
  restoreBotRemote: (botId: string) => Promise<void>;
  removeBotRemote: (botId: string, deleteMemories?: boolean) => Promise<void>;
  archiveGroupRemote: (groupId: string) => Promise<void>;
  restoreGroupRemote: (groupId: string) => Promise<void>;
  removeGroupRemote: (groupId: string) => Promise<void>;
  updateGroupRemote: (input: import("@/types/gateway").UpdateGroupInput) => Promise<void>;
  send: (input: string | SendMessageInput) => Promise<void>;
  stop: () => Promise<void>;
  setDraft: (threadId: string, text: string) => void;
  setReply: (threadId: string, reply: ComposerReply | null) => void;
  setPanel: (panel: "none" | "computer" | "routines" | "memory" | "skills" | "boards" | "call") => void;
  loadComputer: (botId: string) => Promise<void>;
  clearError: () => void;
  hydrateForGateway: (baseUrl?: string) => void;
  applyProductEvent: (event: ProductEvent) => void;
};

let stopSubscribe: (() => void) | null = null;
let wired = false;

function stopLive() {
  stopSubscribe?.();
  stopSubscribe = null;
}

/** Called on disconnect / sign-out. */
export function teardownThreadSubscribe() {
  stopLive();
}

async function startLive(selection: NonNullable<Selection>, cursor: number) {
  stopLive();
  const { config, client } = useConnection.getState();
  if (!client || !config.baseUrl) return;
  const target = selectionTarget(selection);
  stopSubscribe = subscribeThread(config, target, cursor, {
    onEvent: (event) => {
      useWorkspace.getState().applyProductEvent(event);
      emitProductEvent(event);
    },
    onStatus: (status, detail) => {
      if (status === "error" || status === "reconnecting") {
        if (detail) useWorkspace.setState({ error: detail });
      }
    },
  });
}

const cached = initialFromCache();

export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  bots: cached.bots,
  groups: cached.groups,
  statuses: {},
  seenDone: {},
  messages: {},
  cursors: {},
  loadingThread: null,
  selection: null,
  panel: "none",
  computer: null,
  computerLoading: false,
  error: null,
  composerDrafts: cached.composerDrafts,
  composerReplies: {},
  streamingIds: [],

  finishStreaming: (id) =>
    set((state) => ({
      streamingIds: state.streamingIds.filter((item) => item !== id),
    })),

  clearError: () => set({ error: null }),

  hydrateForGateway: (baseUrl) => {
    stopLive();
    const url = (baseUrl ?? gatewayBaseUrl()).trim();
    const roster = loadRoster(url);
    const drafts = loadDrafts(url);
    set({
      bots: roster?.bots ?? [],
      groups: roster?.groups ?? [],
      composerDrafts: drafts,
      composerReplies: {},
      messages: {},
      cursors: {},
      selection: null,
      statuses: {},
      seenDone: {},
      streamingIds: [],
      computer: null,
      panel: "none",
      error: null,
    });
  },

  refreshRoster: async () => {
    const client = useConnection.getState().client;
    if (!client) return;
    try {
      // Prefer bootstrap (single round-trip); fall back to list RPCs.
      try {
        const boot = await client.bootstrap();
        const bots = (Array.isArray(boot.bots) ? boot.bots : []).map((row) => {
          const b = row as {
            id: string;
            name?: string;
            title?: string;
            description?: string;
            threadId?: string;
            preview?: string | null;
          };
          const preview =
            typeof b.preview === "string" && b.preview.trim() ? b.preview.trim() : null;
          return {
            id: b.id,
            name: b.name || "Bot",
            role: (b.title || b.description || "").trim(),
            emoji: "",
            thread_id: b.threadId || b.id,
            last_message: preview
              ? {
                  id: `preview:${b.id}`,
                  thread_id: b.threadId || b.id,
                  sender: "bot" as const,
                  kind: "text" as const,
                  content: preview,
                  payload: null,
                  created_at: 0,
                }
              : null,
          };
        });
        const groups = Array.isArray(boot.groups) ? boot.groups : [];
        set(() => {
          persistRoster({ bots, groups });
          return { bots, groups, error: null as string | null };
        });
        return;
      } catch {
        /* fall through */
      }
      const [bots, groups] = await Promise.all([
        client.fetchBots(),
        client.fetchGroups().catch(() => get().groups),
      ]);
      set(() => {
        persistRoster({ bots, groups });
        return { bots, groups, error: null as string | null };
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "加载列表失败。",
      });
    }
  },

  loadThread: async (selection) => {
    const client = useConnection.getState().client;
    if (!client) return;
    const threadId = selection.threadId;
    const target = selectionTarget(selection);
    set({ loadingThread: threadId });
    try {
      const head = await client.threadHead(target).catch(() => null);
      const fetched = await client.fetchMessages(target);
      const messages = ensureOldestFirst(fetched.messages);
      const cursor = head?.cursor ?? fetched.cursor;
      set((state) => ({
        messages: { ...state.messages, [threadId]: messages },
        cursors: { ...state.cursors, [threadId]: cursor },
        loadingThread: state.loadingThread === threadId ? null : state.loadingThread,
      }));
      void import("@/stores/attention").then(({ useAttention }) => {
        useAttention.getState().syncFromMessages(threadId, messages);
      });
      await startLive(selection, cursor);
      void client.markRead(target).catch(() => undefined);
    } catch (err) {
      set({
        loadingThread: null,
        error: err instanceof Error ? err.message : "Failed to load messages.",
      });
    }
  },

  clearThreadHistory: async () => {
    const client = useConnection.getState().client;
    const selection = get().selection;
    if (!client || !selection) return;
    const target = selectionTarget(selection);
    try {
      await client.clearThread(target);
      set((state) => ({
        messages: { ...state.messages, [selection.threadId]: [] },
        cursors: { ...state.cursors, [selection.threadId]: -1 },
        error: null,
      }));
      await startLive(selection, -1);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "清空会话失败。" });
    }
  },

  markThreadUnread: async (messageId) => {
    const client = useConnection.getState().client;
    const selection = get().selection;
    if (!client || !selection) return;
    try {
      await client.markUnread(selectionTarget(selection), messageId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "标记未读失败。" });
    }
  },

  reactToMessage: async (messageId, reaction) => {
    const client = useConnection.getState().client;
    const selection = get().selection;
    if (!client || !selection) return;
    try {
      await client.react(selectionTarget(selection), { messageId, reaction });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "反应失败。" });
      throw err;
    }
  },

  archiveBotRemote: async (botId) => {
    const client = useConnection.getState().client;
    if (!client) return;
    await client.archiveBot(botId);
    await get().refreshRoster();
    const sel = get().selection;
    if (sel?.kind === "dm" && sel.botId === botId) {
      set({ selection: null });
      stopLive();
    }
  },

  restoreBotRemote: async (botId) => {
    const client = useConnection.getState().client;
    if (!client) return;
    await client.restoreBot(botId);
    await get().refreshRoster();
  },

  removeBotRemote: async (botId, deleteMemories = false) => {
    const client = useConnection.getState().client;
    if (!client) return;
    await client.removeBot(botId, deleteMemories);
    await get().refreshRoster();
    const sel = get().selection;
    if (sel?.kind === "dm" && sel.botId === botId) {
      set({ selection: null });
      stopLive();
    }
  },

  archiveGroupRemote: async (groupId) => {
    const client = useConnection.getState().client;
    if (!client) return;
    await client.archiveGroup(groupId);
    await get().refreshRoster();
    const sel = get().selection;
    if (sel?.kind === "group" && sel.groupId === groupId) {
      set({ selection: null });
      stopLive();
    }
  },

  restoreGroupRemote: async (groupId) => {
    const client = useConnection.getState().client;
    if (!client) return;
    await client.restoreGroup(groupId);
    await get().refreshRoster();
  },

  removeGroupRemote: async (groupId) => {
    const client = useConnection.getState().client;
    if (!client) return;
    await client.removeGroup(groupId);
    await get().refreshRoster();
    const sel = get().selection;
    if (sel?.kind === "group" && sel.groupId === groupId) {
      set({ selection: null });
      stopLive();
    }
  },

  updateGroupRemote: async (input) => {
    const client = useConnection.getState().client;
    if (!client) return;
    const group = await client.updateGroup(input);
    set((state) => {
      const groups = state.groups.map((g) => (g.id === group.id ? group : g));
      persistRoster({ bots: state.bots, groups });
      return { groups };
    });
  },

  openBot: async (botId: string) => {
    const bot = get().bots.find((item) => item.id === botId);
    if (!bot) return;
    const selection: NonNullable<Selection> = {
      kind: "dm",
      botId,
      threadId: bot.thread_id || bot.id,
    };
    set((state) => ({
      selection,
      seenDone: { ...state.seenDone, [botId]: false },
      panel: "none",
      computer: null,
    }));
    void import("@/stores/attention").then(({ useAttention }) => {
      useAttention.getState().clearThread(selection.threadId);
    });
    await get().loadThread(selection);
  },

  openGroup: async (groupId: string) => {
    const group = get().groups.find((item) => item.id === groupId);
    if (!group) return;
    const selection: NonNullable<Selection> = {
      kind: "group",
      groupId: group.id,
      threadId: group.threadId || group.id,
    };
    set({ selection, panel: "none", computer: null });
    void import("@/stores/attention").then(({ useAttention }) => {
      useAttention.getState().clearThread(selection.threadId);
    });
    await get().loadThread(selection);
  },

  startChatWithAgents: async (botIds: string[]) => {
    const unique = [...new Set(botIds)].filter(Boolean);
    if (unique.length < 2) return { localStub: false };
    const client = useConnection.getState().client;
    const bots = get().bots;
    const names = unique
      .map((id) => bots.find((b) => b.id === id)?.name ?? id)
      .slice(0, 3);
    const title =
      names.length >= 2
        ? `${names.slice(0, 2).join(" · ")}${unique.length > 2 ? ` +${unique.length - 2}` : ""}`
        : "Agents";
    const key = (ids: string[]) => [...ids].sort().join("|");
    const want = key(unique);
    const existing = get().groups.find(
      (g) => key(g.members.map((m) => m.botId)) === want,
    );
    if (existing) {
      await get().openGroup(existing.id);
      return { localStub: false };
    }
    if (!client) {
      set({ error: "未连接 Rakazo，无法创建群聊。" });
      return { localStub: false };
    }
    try {
      const group = await client.createGroup(title, unique);
      set((state) => {
        const groups = [group, ...state.groups.filter((g) => g.id !== group.id)];
        persistRoster({ bots: state.bots, groups });
        return { groups };
      });
      await get().openGroup(group.id);
      return { localStub: false };
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "创建群聊失败。",
      });
      return { localStub: false };
    }
  },

  setDraft: (threadId, text) =>
    set((state) => {
      const composerDrafts = { ...state.composerDrafts };
      if (text) composerDrafts[threadId] = text;
      else delete composerDrafts[threadId];
      persistDraftsSoon(composerDrafts);
      return { composerDrafts };
    }),

  setReply: (threadId, reply) =>
    set((state) => {
      const composerReplies = { ...state.composerReplies };
      if (reply) composerReplies[threadId] = reply;
      else delete composerReplies[threadId];
      return { composerReplies };
    }),

  send: async (input) => {
    const client = useConnection.getState().client;
    const selection = get().selection;
    const body: SendMessageInput =
      typeof input === "string" ? { text: input } : { ...input };
    const trimmed = (body.text ?? "").trim();
    const artifactIds = body.artifactIds?.filter(Boolean) ?? [];
    if (!selection || !client) return;
    if (!trimmed && artifactIds.length === 0) return;
    const threadId = selection.threadId;
    const restoreText = trimmed;
    const reply = get().composerReplies[threadId];
    const replyToMessageId = body.replyToMessageId ?? reply?.messageId;
    const replyQuote = body.replyQuote ?? (reply?.preview ? reply.preview : undefined);
    set((state) => {
      const composerDrafts = { ...state.composerDrafts };
      const composerReplies = { ...state.composerReplies };
      delete composerDrafts[threadId];
      delete composerReplies[threadId];
      persistDraftsNow(composerDrafts);
      return { composerDrafts, composerReplies };
    });
    try {
      await client.sendMessage(selectionTarget(selection), {
        ...(trimmed ? { text: trimmed } : {}),
        ...(artifactIds.length ? { artifactIds } : {}),
        ...(body.mentions && body.mentions.length ? { mentions: body.mentions } : {}),
        ...(replyToMessageId
          ? {
              replyToMessageId,
              ...(replyQuote?.trim()
                ? { replyQuote: replyQuote.trim().slice(0, 2000) }
                : {}),
            }
          : {}),
      });
    } catch (err) {
      get().setDraft(threadId, restoreText);
      if (reply) get().setReply(threadId, reply);
      set({ error: err instanceof Error ? err.message : "Send failed." });
      throw err;
    }
  },

  stop: async () => {
    const client = useConnection.getState().client;
    const selection = get().selection;
    if (!client || !selection) return;
    try {
      await client.stopThread(selectionTarget(selection));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Stop failed." });
    }
  },

  setPanel: (panel) => {
    set({ panel });
    const selection = get().selection;
    if (panel === "computer" && selection?.kind === "dm") {
      void get().loadComputer(selection.botId);
    }
  },

  loadComputer: async (botId: string) => {
    const client = useConnection.getState().client;
    if (!client) return;
    set({ computerLoading: true });
    try {
      const computer = await client.fetchComputer(botId);
      set({ computer, computerLoading: false });
    } catch (err) {
      set({
        computerLoading: false,
        error: err instanceof Error ? err.message : "Computer panel failed.",
      });
    }
  },

  applyProductEvent: (event) => {
    const status = statusFromProductEvent(event);
    if (status) {
      set((state) => {
        const previous = state.statuses[status.botId] ?? "idle";
        const watching =
          state.selection?.kind === "dm" && state.selection.botId === status.botId;
        const justFinished =
          previous === "thinking" &&
          (status.status === "idle" || status.status === "done") &&
          !watching;
        return {
          statuses: { ...state.statuses, [status.botId]: status.status },
          seenDone: justFinished
            ? { ...state.seenDone, [status.botId]: true }
            : state.seenDone,
          cursors: {
            ...state.cursors,
            [event.threadId]: Math.max(state.cursors[event.threadId] ?? -1, event.seq ?? -1),
          },
        };
      });
    } else if (typeof event.seq === "number") {
      set((state) => ({
        cursors: {
          ...state.cursors,
          [event.threadId]: Math.max(state.cursors[event.threadId] ?? -1, event.seq),
        },
      }));
    }

    const message = messageFromProductEvent(event);
    if (!message) return;
    const threadId = event.threadId;
    // Prefer selection thread bucket when ids differ.
    const sel = get().selection;
    const bucket =
      sel && (sel.threadId === threadId || sel.kind === "dm" && sel.botId === event.botId)
        ? sel.threadId
        : threadId;
    message.thread_id = bucket;
    set((state) => {
      const shouldStream =
        message.sender !== "user" &&
        message.kind === "text" &&
        !state.streamingIds.includes(message.id);
      return {
        messages: {
          ...state.messages,
          [bucket]: upsertMessage(state.messages[bucket], message),
        },
        streamingIds: shouldStream
          ? [...state.streamingIds, message.id].slice(-40)
          : state.streamingIds,
      };
    });
  },
}));

export function bindWorkspaceEvents(): () => void {
  if (wired) return () => undefined;
  wired = true;
  return () => {
    stopLive();
  };
}

export function clientOrNull(): GatewayClient | null {
  return useConnection.getState().client;
}
