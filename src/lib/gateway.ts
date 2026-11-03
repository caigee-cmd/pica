import { clientNonce, mapThreadMessage } from "@/lib/rakazoMap";
import { ensureOldestFirst } from "@/lib/messageOrder";
import { gatewayFetch, readSetAuthToken, rpc } from "@/lib/transport";
import type {
  AgentSkill,
  ApprovalAnswer,
  ApprovalRule,
  AppBootstrap,
  AppConnection,
  ArtifactListItem,
  ArtifactMeta,
  AutoReviewSettings,
  Board,
  Bot,
  CapabilityInstall,
  ComputerFileEntry,
  ComputerInfo,
  ComputerTakeover,
  ConnectionCatalogEntry,
  CreateApprovalRuleInput,
  CreateRoutineInput,
  AuthCapabilities,
  DevicePairResult,
  DeviceSummary,
  GatewayConfig,
  Group,
  McpAssignment,
  McpServer,
  MemoryBudget,
  MemoryDocument,
  MemoryProviderConfig,
  Message,
  MessageReaction,
  ModelCatalogEntry,
  ModelConnectInput,
  ModelCredential,
  ModelRoleUpdate,
  ModelRoleView,
  PreferencesUpdateInput,
  RoutineAction,
  RoutineHistoryPage,
  RoutineMentionBatch,
  RunActivityRow,
  SearchQueryOutput,
  SendMessageInput,
  TaughtSkill,
  ThreadHead,
  ThreadMessagePage,
  ThreadSnapshot,
  ThreadTarget,
  Ticket,
  TicketComment,
  TicketPriority,
  TicketStatus,
  UpdateBotInput,
  UpdateGroupInput,
  UpdateRoutineInput,
  VoiceCatalogEntry,
  VoiceStatus,
  VoiceCredential,
  VoiceInfo,
  VoiceConnectInput,
  VoicePrepareResult,
  MessagingInstallationsStatus,
  MessagingStatus,
  MessagingLinkedIdentity,
  MessagingChannelMembership,
  MessagingAgentConnection,
  SpaceNav,
  SpaceRow,
  SignupSurveyInput,
  ScratchpadItem,
  ScratchpadItemStatus,
  UsageRecord,
  UsageSummary,
  ExportManifest,
  SecurityEvent,
  AuditEventPage,
  DeploymentSettings,
  VaultSecretMeta,
  VaultPutDestination,
  VaultRevealed,
  AgentSecret,
  SettingsScopeInput,
  BillingStatus,
  ServerUpdateStatus,
  ServerUpdateCheck,
  ServerUpdateRun,
  ServerUpdateRequest,
} from "@/types/gateway";

export class GatewayError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "GatewayError";
  }
}

export class SignedOut extends GatewayError {
  constructor() {
    super(401, "尚未登录。请先在设置里用邮箱密码登录 Rakazo。");
    this.name = "SignedOut";
  }
}

/** Rakazo bots.list row (subset). */
type RakazoBot = {
  id: string;
  name: string;
  title?: string;
  description?: string;
  color?: string;
  threadId?: string;
  preview?: string | null;
  status?: string;
  avatarSet?: string;
  avatarFamily?: string;
};

export type RakazoMe = {
  user?: { id?: string; email?: string; name?: string };
  email?: string;
  name?: string;
  id?: string;
};

export type AuthResult = {
  token: string;
  user?: { id?: string; email?: string; name?: string };
};

function mapRakazoBot(b: RakazoBot): Bot {
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
          sender: "bot",
          kind: "text",
          content: preview,
          payload: null,
          created_at: 0,
        }
      : null,
  };
}

function asTarget(target: ThreadTarget): ThreadTarget {
  if (target.botId) return { botId: target.botId };
  if (target.groupId) return { groupId: target.groupId };
  throw new GatewayError(0, "thread target 需要 botId 或 groupId");
}

/**
 * Thin HTTP/RPC client for self-hosted Rakazo.
 * All traffic goes through Tauri `gateway_request` (cookie jar + optional Bearer).
 */
export class GatewayClient {
  constructor(private config: GatewayConfig) {}

  withToken(token: string): GatewayClient {
    return new GatewayClient({ ...this.config, token: token.trim() });
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await gatewayFetch(this.config, path, init);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "network error";
      throw new GatewayError(0, `无法连接 ${this.config.baseUrl}（${reason}）`);
    }
    if (res.status === 401) throw new SignedOut();
    return res;
  }

  private async send(method: string, path: string, body?: unknown): Promise<Response> {
    const res = await this.request(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok && res.status !== 409) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        code?: string;
        json?: { message?: string };
      };
      throw new GatewayError(
        res.status,
        data.json?.message ?? data.message ?? data.error ?? `${method} ${path} failed (${res.status})`,
        data.code,
      );
    }
    return res;
  }

  private async callRpc<T>(procedure: string, json: unknown = {}): Promise<T> {
    try {
      return await rpc<T>(this.config, procedure, json);
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      const status =
        typeof err === "object" && err && "status" in err
          ? Number((err as { status: number }).status)
          : 0;
      const code =
        typeof err === "object" && err && "code" in err
          ? String((err as { code?: string }).code)
          : undefined;
      const message = err instanceof Error ? err.message : `RPC ${procedure} failed`;
      if (status === 401) throw new SignedOut();
      throw new GatewayError(status, message, code);
    }
  }

  async checkHealth(): Promise<{ ok: true; version: string }> {
    const data = await this.callRpc<{ ok: boolean; version: string }>("health", {});
    if (data?.ok === true && typeof data.version === "string") {
      return { ok: true, version: data.version };
    }
    throw new GatewayError(0, "健康检查失败：响应格式不符合预期");
  }


  /** GET /api/auth/capabilities — unauthenticated. */
  async fetchAuthCapabilities(): Promise<AuthCapabilities> {
    const bare = new GatewayClient({ ...this.config, token: "" });
    let res: Response;
    try {
      res = await gatewayFetch(bare.config, "/api/auth/capabilities", { method: "GET" });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "network error";
      throw new GatewayError(0, `无法连接 ${this.config.baseUrl}（${reason}）`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GatewayError(res.status, text || `capabilities failed (${res.status})`);
    }
    const raw = (await res.json()) as Partial<AuthCapabilities> & {
      sso?: { name?: string; available?: boolean; label?: string } | null;
    };
    const ssoRaw = raw.sso;
    const sso =
      ssoRaw && typeof ssoRaw === "object"
        ? {
            name: String(ssoRaw.name || ssoRaw.label || "SSO"),
            available: Boolean(ssoRaw.available),
          }
        : null;
    return {
      passwordAuth: raw.passwordAuth !== false,
      passwordReset: Boolean(raw.passwordReset),
      resetUrl: typeof raw.resetUrl === "string" ? raw.resetUrl : null,
      emailCode: Boolean(raw.emailCode),
      sso,
      billing: Boolean(raw.billing),
      passkeyRpId: typeof raw.passkeyRpId === "string" ? raw.passkeyRpId : null,
      nativePasskeys: raw.nativePasskeys,
      crispWebsiteId: typeof raw.crispWebsiteId === "string" ? raw.crispWebsiteId : null,
    };
  }

  async fetchMe(): Promise<RakazoMe> {
    return this.callRpc<RakazoMe>("me", {});
  }

  /** contracts bootstrap — roster + optional thread snapshot. */
  async bootstrap(botId?: string): Promise<AppBootstrap> {
    return this.callRpc<AppBootstrap>("bootstrap", botId ? { botId } : {});
  }

  async checkSession(): Promise<{
    ok: boolean;
    version?: string;
    signedIn: boolean;
    me?: RakazoMe;
  }> {
    try {
      const me = await this.fetchMe();
      return { ok: true, signedIn: true, me };
    } catch (err) {
      if (err instanceof SignedOut) {
        const health = await this.checkHealth();
        return { ok: true, version: health.version, signedIn: false };
      }
      try {
        const health = await this.checkHealth();
        return { ok: true, version: health.version, signedIn: false };
      } catch {
        throw err;
      }
    }
  }

  async signInEmail(email: string, password: string): Promise<AuthResult> {
    return this.authEmail("/api/auth/sign-in/email", {
      email: email.trim(),
      password,
      rememberMe: true,
    });
  }

  async signUpEmail(email: string, password: string, name?: string): Promise<AuthResult> {
    const trimmed = email.trim();
    return this.authEmail("/api/auth/sign-up/email", {
      email: trimmed,
      password,
      name: (name || trimmed.split("@")[0] || "User").trim(),
    });
  }

  async signOut(): Promise<void> {
    try {
      await this.send("POST", "/api/auth/sign-out", {});
    } catch (err) {
      if (!(err instanceof SignedOut)) throw err;
    }
  }

  private async authEmail(path: string, body: Record<string, unknown>): Promise<AuthResult> {
    const bare = new GatewayClient({ ...this.config, token: "" });
    let res: Response;
    try {
      res = await gatewayFetch(bare.config, path, {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "network error";
      throw new GatewayError(0, `无法连接 ${this.config.baseUrl}（${reason}）`);
    }
    const token = readSetAuthToken(res);
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      /* empty ok */
    }
    if (!res.ok) {
      const message =
        (typeof data.message === "string" && data.message) ||
        (typeof data.error === "string" && data.error) ||
        `登录失败（${res.status}）`;
      const code = typeof data.code === "string" ? data.code : undefined;
      throw new GatewayError(res.status, message, code);
    }
    const userRaw = (data.user ?? data) as Record<string, unknown> | undefined;
    const user =
      userRaw && typeof userRaw === "object"
        ? {
            id: typeof userRaw.id === "string" ? userRaw.id : undefined,
            email: typeof userRaw.email === "string" ? userRaw.email : undefined,
            name: typeof userRaw.name === "string" ? userRaw.name : undefined,
          }
        : undefined;
    return { token, user };
  }

  async fetchBots(): Promise<Bot[]> {
    const rows = await this.callRpc<RakazoBot[]>("bots.list", {});
    return (Array.isArray(rows) ? rows : []).map(mapRakazoBot);
  }

  /** Alias used by some drafts. */
  listBots(): Promise<Bot[]> {
    return this.fetchBots();
  }

  createBot(name: string, role: string): Promise<Bot> {
    return this.callRpc<RakazoBot>("bots.create", {
      name,
      description: role || "",
      instructions: role || "",
    }).then(mapRakazoBot);
  }

  async fetchGroups(): Promise<Group[]> {
    const rows = await this.callRpc<Group[]>("groups.list", {});
    return Array.isArray(rows) ? rows : [];
  }

  listGroups(): Promise<Group[]> {
    return this.fetchGroups();
  }

  createGroup(name: string, botIds: string[]): Promise<Group> {
    return this.callRpc<Group>("groups.create", { name, botIds });
  }

  getGroup(groupId: string): Promise<Group> {
    return this.callRpc<Group>("groups.get", { groupId });
  }

  updateGroup(input: UpdateGroupInput): Promise<Group> {
    if (!input.groupId) throw new GatewayError(0, "groups.update 需要 groupId");
    return this.callRpc<Group>("groups.update", input);
  }

  async archiveGroup(groupId: string): Promise<void> {
    if (!groupId) throw new GatewayError(0, "groups.archive 需要 groupId");
    await this.callRpc("groups.archive", { groupId });
  }

  listArchivedGroups(): Promise<Group[]> {
    return this.callRpc<Group[]>("groups.listArchived", {}).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  async restoreGroup(groupId: string): Promise<void> {
    if (!groupId) throw new GatewayError(0, "groups.restore 需要 groupId");
    await this.callRpc("groups.restore", { groupId });
  }

  async removeGroup(groupId: string): Promise<void> {
    if (!groupId) throw new GatewayError(0, "groups.remove 需要 groupId");
    await this.callRpc("groups.remove", { groupId });
  }

  threadHead(target: ThreadTarget): Promise<ThreadHead> {
    return this.callRpc<ThreadHead>("threads.head", asTarget(target));
  }

  fetchThreadMessages(
    target: ThreadTarget,
    opts?: { before?: number },
  ): Promise<ThreadMessagePage> {
    return this.callRpc<ThreadMessagePage>("threads.messages", {
      ...asTarget(target),
      ...(opts?.before != null ? { before: opts.before } : {}),
    });
  }

  /** History as UI messages + subscribe cursor hint. */
  async fetchMessages(
    target: ThreadTarget,
  ): Promise<{ messages: Message[]; threadId: string; cursor: number }> {
    const page = await this.fetchThreadMessages(target);
    // pages may be newest-first (`before` / olderCursor); normalize oldest→newest
    const messages = ensureOldestFirst((page.messages || []).map(mapThreadMessage));
    const cursor =
      typeof page.coveredThroughSeq === "number"
        ? page.coveredThroughSeq
        : messages.reduce((max, m) => Math.max(max, typeof m.seq === "number" ? m.seq : -1), -1);
    return { messages, threadId: page.threadId, cursor };
  }

  async sendMessage(target: ThreadTarget, input: string | SendMessageInput): Promise<void> {
    const body = typeof input === "string" ? { text: input } : input;
    const text = body.text?.trim() ?? "";
    const artifactIds = body.artifactIds?.filter(Boolean) ?? [];
    if (!text && artifactIds.length === 0) {
      throw new GatewayError(0, "Provide text or at least one attachment");
    }
    await this.callRpc("threads.send", {
      ...asTarget(target),
      ...(text ? { text } : {}),
      ...(artifactIds.length ? { artifactIds } : {}),
      ...(body.mentions && body.mentions.length ? { mentions: body.mentions } : {}),
      ...(body.replyToMessageId
        ? {
            replyToMessageId: body.replyToMessageId,
            ...(body.replyQuote?.trim()
              ? { replyQuote: body.replyQuote.trim().slice(0, 2000) }
              : {}),
          }
        : {}),
      clientNonce: body.clientNonce ?? clientNonce(),
    });
  }

  /** Upload bytes then pass returned id(s) to threads.send as artifactIds. */
  async createArtifact(
    target: ThreadTarget,
    input: {
      name: string;
      mimeType: string;
      contentBase64: string;
      description?: string;
      clientNonce?: string;
    },
  ): Promise<ArtifactMeta> {
    return this.callRpc<ArtifactMeta>("artifacts.create", {
      ...asTarget(target),
      name: input.name.slice(0, 255),
      mimeType: input.mimeType,
      contentBase64: input.contentBase64,
      ...(input.description ? { description: input.description.slice(0, 280) } : {}),
      clientNonce: input.clientNonce ?? clientNonce(),
    });
  }

  listModels(): Promise<ModelCatalogEntry[]> {
    return this.callRpc<ModelCatalogEntry[]>("models.list", {}).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  getModelRole(role: "main" | "approval" = "main"): Promise<ModelRoleView> {
    return this.callRpc<ModelRoleView>("models.role", { role });
  }

  listModelCredentials(): Promise<ModelCredential[]> {
    return this.callRpc<ModelCredential[]>("models.credentials", {}).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  connectModel(input: ModelConnectInput): Promise<ModelCredential> {
    if (!input.provider?.trim()) throw new GatewayError(0, "models.connect 需要 provider");
    return this.callRpc<ModelCredential>("models.connect", input);
  }

  setModelRole(
    role: "main" | "approval",
    update: ModelRoleUpdate,
  ): Promise<ModelRoleView> {
    return this.callRpc<ModelRoleView>("models.setRole", { role, ...update });
  }

  async setDefaultModel(input: {
    provider: string;
    modelId: string;
    thinkingLevel?: string | null;
  }): Promise<void> {
    if (!input.provider?.trim() || !input.modelId?.trim()) {
      throw new GatewayError(0, "models.setDefault 需要 provider 与 modelId");
    }
    await this.callRpc("models.setDefault", input);
  }

  async updateBot(input: UpdateBotInput): Promise<Bot> {
    if (!input.botId) throw new GatewayError(0, "bots.update 需要 botId");
    const row = await this.callRpc<RakazoBot>("bots.update", input);
    return mapRakazoBot(row);
  }

  async getBot(botId: string): Promise<Bot> {
    if (!botId) throw new GatewayError(0, "bots.get 需要 botId");
    const row = await this.callRpc<RakazoBot>("bots.get", { botId });
    return mapRakazoBot(row);
  }

  async archiveBot(botId: string): Promise<void> {
    if (!botId) throw new GatewayError(0, "bots.archive 需要 botId");
    await this.callRpc("bots.archive", { botId });
  }

  listArchivedBots(): Promise<Bot[]> {
    return this.callRpc<RakazoBot[]>("bots.listArchived", {}).then((rows) =>
      (Array.isArray(rows) ? rows : []).map(mapRakazoBot),
    );
  }

  async restoreBot(botId: string): Promise<void> {
    if (!botId) throw new GatewayError(0, "bots.restore 需要 botId");
    await this.callRpc("bots.restore", { botId });
  }

  async removeBot(botId: string, deleteMemories = false): Promise<void> {
    if (!botId) throw new GatewayError(0, "bots.remove 需要 botId");
    await this.callRpc("bots.remove", { botId, deleteMemories });
  }

  async stopThread(target: ThreadTarget): Promise<void> {
    await this.callRpc("threads.stop", asTarget(target));
  }

  getThread(target: ThreadTarget): Promise<ThreadSnapshot> {
    return this.callRpc<ThreadSnapshot>("threads.get", asTarget(target));
  }

  async clearThread(target: ThreadTarget): Promise<void> {
    await this.callRpc("threads.clear", asTarget(target));
  }

  async markRead(
    target: ThreadTarget,
  ): Promise<{ ok: true; unreadAfterSeq: number | null }> {
    return this.callRpc("threads.markRead", asTarget(target));
  }

  async markUnread(target: ThreadTarget, messageId?: string): Promise<void> {
    await this.callRpc("threads.markUnread", {
      ...asTarget(target),
      ...(messageId ? { messageId } : {}),
    });
  }

  async react(
    target: ThreadTarget,
    input: { messageId: string; reaction: MessageReaction; clientNonce?: string },
  ): Promise<{ ok: true; runIds?: string[] }> {
    if (!input.messageId) throw new GatewayError(0, "threads.react 需要 messageId");
    return this.callRpc("threads.react", {
      ...asTarget(target),
      messageId: input.messageId,
      reaction: input.reaction,
      clientNonce: input.clientNonce ?? clientNonce(),
    });
  }

  searchQuery(q: string): Promise<SearchQueryOutput> {
    return this.callRpc<SearchQueryOutput>("search.query", { q: q.slice(0, 200) });
  }

  async fetchComputer(botId: string): Promise<ComputerInfo> {
    type Status = {
      botId?: string;
      state?: ComputerInfo["state"];
      kind?: string;
      mode?: string;
      screenAvailable?: boolean;
      terminalAvailable?: boolean;
      controlHolder?: ComputerInfo["controlHolder"];
      takeoverRequested?: boolean;
    };
    const [status, screen, terminal, routines] = await Promise.all([
      this.callRpc<Status>("computer.status", { botId }).catch(() => null),
      this.callRpc<{ url: string | null }>("computer.screenUrl", { botId }).catch(() => ({
        url: null as string | null,
      })),
      this.callRpc<{ url: string | null }>("computer.terminalUrl", { botId }).catch(() => ({
        url: null as string | null,
      })),
      this.callRpc<unknown[]>("routines.list", { botId }).catch(() => [] as unknown[]),
    ]);
    const routineRows = Array.isArray(routines) ? routines : [];
    const running = status?.state === "running" || Boolean(screen?.url);
    const gaps = [
      "computer shell toggle (no RPC)",
      "computer window show/hide (no RPC)",
    ];
    return {
      botId,
      running,
      state: status?.state,
      kind: status?.kind,
      mode: status?.mode,
      vncUrl: screen?.url ?? null,
      terminalUrl: terminal?.url ?? null,
      screen: screen?.url ? { kind: "vnc", url: screen.url } : null,
      screenAvailable: status?.screenAvailable ?? Boolean(screen?.url),
      terminalAvailable: status?.terminalAvailable ?? Boolean(terminal?.url),
      controlHolder: status?.controlHolder,
      takeoverRequested: status?.takeoverRequested,
      shell: {
        enabled: Boolean(terminal?.url),
        available: Boolean(status?.terminalAvailable ?? terminal?.url),
        why: terminal?.url ? undefined : "Open terminalUrl when computer.terminalAvailable",
      },
      gaps,
      routines: routineRows.map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        const crons = Array.isArray(o.crons) ? o.crons.map(String) : [];
        const cron = crons.join(", ") || String(o.cron ?? "");
        const next =
          typeof o.nextRunAt === "string" && o.nextRunAt
            ? `next ${o.nextRunAt}`
            : typeof o.lastRunAt === "string" && o.lastRunAt
              ? `last ${o.lastRunAt}`
              : cron;
        return {
          id: String(o.id ?? ""),
          name: String(o.name ?? ""),
          cron,
          human: next,
          last_run_at:
            typeof o.lastRunAt === "string"
              ? Date.parse(o.lastRunAt)
              : typeof o.last_run_at === "number"
                ? o.last_run_at
                : null,
          enabled: o.active === false || o.enabled === 0 || o.enabled === false ? 0 : 1,
          mode: o.watch ? ("watch" as const) : ("act" as const),
          webhook_path: o.webhookEnabled ? "webhook" : null,
          prompt: typeof o.prompt === "string" ? o.prompt : undefined,
          timezone: typeof o.timezone === "string" ? o.timezone : undefined,
          notify: typeof o.notify === "boolean" ? o.notify : undefined,
          webhookEnabled: typeof o.webhookEnabled === "boolean" ? o.webhookEnabled : undefined,
          githubEnabled: typeof o.githubEnabled === "boolean" ? o.githubEnabled : undefined,
          messageProvider:
            o.messageProvider == null
              ? null
              : typeof o.messageProvider === "string"
                ? o.messageProvider
                : undefined,
          editable: typeof o.editable === "boolean" ? o.editable : undefined,
        };
      }),
    };
  }

  /**
   * Answer an ask / choice / login card.
   * Contracts: threads.answer needs threadTarget + runId + messageId + answer string
   * (`allow` | `deny` | `always` | choice option id | free text). Not numeric approvalId.
   */
  async answerThread(
    target: ThreadTarget,
    args: {
      runId: string;
      messageId: string;
      answer: string;
      dismiss?: true;
      fields?: { label: string; value: string }[];
      username?: string;
      remember?: false;
      clientNonce?: string;
    },
  ): Promise<void> {
    if (!args.runId) throw new GatewayError(0, "threads.answer 需要 runId");
    if (!args.messageId) throw new GatewayError(0, "threads.answer 需要 messageId");
    await this.callRpc("threads.answer", {
      ...asTarget(target),
      runId: args.runId,
      messageId: args.messageId,
      answer: args.dismiss ? "" : args.answer,
      ...(args.dismiss ? { dismiss: true as const } : {}),
      ...(args.fields ? { fields: args.fields } : {}),
      ...(args.username ? { username: args.username } : {}),
      ...(args.remember === false ? { remember: false as const } : {}),
      ...(args.clientNonce ? { clientNonce: args.clientNonce } : {}),
    });
  }

  async resolveApproval(
    target: ThreadTarget,
    opts: { runId: string; messageId: string; answer: ApprovalAnswer },
  ): Promise<void> {
    await this.answerThread(target, {
      runId: opts.runId,
      messageId: opts.messageId,
      answer: opts.answer,
    });
  }

  async answerQuestion(
    target: ThreadTarget,
    opts: { runId: string; messageId: string; answer: string },
  ): Promise<void> {
    await this.answerThread(target, opts);
  }

  async updateRoutine(id: string, action: RoutineAction): Promise<void> {
    if (!id) throw new GatewayError(0, "routineId 缺失");
    if (action === "run") {
      await this.callRpc("routines.testRun", { routineId: id });
      return;
    }
    if (action === "delete") {
      await this.callRpc("routines.remove", { routineId: id });
      return;
    }
    await this.callRpc("routines.update", {
      routineId: id,
      active: action === "resume",
    });
  }

  async bootComputer(botId: string): Promise<ComputerInfo> {
    await this.callRpc("computer.boot", { botId });
    return this.fetchComputer(botId);
  }

  async stopComputer(botId: string): Promise<ComputerInfo> {
    await this.callRpc("computer.stop", { botId });
    return this.fetchComputer(botId);
  }

  /** No shell-enable RPC in contracts — refresh status/urls only. */
  async patchComputerShell(botId: string, _enabled: boolean): Promise<ComputerInfo> {
    return this.fetchComputer(botId);
  }

  /** No window RPC in contracts. */
  async setComputerWindow(_botId: string, _shown: boolean): Promise<{ ok: boolean }> {
    return { ok: false };
  }

  async listApprovalRules(): Promise<ApprovalRule[]> {
    const rows = await this.callRpc<ApprovalRule[]>("approvalRules.list", {});
    return Array.isArray(rows) ? rows : [];
  }

  async revokeRule(id: string): Promise<void> {
    await this.callRpc("approvalRules.remove", { id });
  }

  async getAutoReview(): Promise<AutoReviewSettings> {
    return this.callRpc<AutoReviewSettings>("autoReview.get", {});
  }

  async setAutoReview(input: {
    mode?: "never" | "auto" | "ask";
    enabled?: boolean;
    skipApprovals?: boolean;
  }): Promise<AutoReviewSettings> {
    return this.callRpc<AutoReviewSettings>("autoReview.set", input);
  }

  /** contracts routines.create */
  async createRoutine(input: CreateRoutineInput): Promise<unknown> {
    if (!input.botId) throw new GatewayError(0, "routines.create 需要 botId");
    if (!input.name?.trim()) throw new GatewayError(0, "routines.create 需要 name");
    if (!input.prompt?.trim()) throw new GatewayError(0, "routines.create 需要 prompt");
    return this.callRpc("routines.create", input);
  }

  /** contracts routines.update (partial fields beyond pause/resume). */
  async patchRoutine(input: UpdateRoutineInput): Promise<unknown> {
    if (!input.routineId) throw new GatewayError(0, "routines.update 需要 routineId");
    return this.callRpc("routines.update", input);
  }

  /** contracts approvalRules.set — create/upsert. */
  async createApprovalRule(input: CreateApprovalRuleInput): Promise<ApprovalRule> {
    if (!input.matchValue?.trim()) throw new GatewayError(0, "approvalRules.set 需要 matchValue");
    return this.callRpc<ApprovalRule>("approvalRules.set", {
      effect: input.effect,
      matchKind: input.matchKind,
      matchValue: input.matchValue.trim(),
    });
  }

  /** POST /api/devices/pair — owner session; token shown once. */
  async pairDevice(input: {
    name: string;
    platform: "darwin" | "win32" | "linux";
  }): Promise<DevicePairResult> {
    const res = await this.send("POST", "/api/devices/pair", {
      name: input.name.slice(0, 128),
      platform: input.platform,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GatewayError(res.status, text || `pair failed (${res.status})`);
    }
    const body = (await res.json()) as Partial<DevicePairResult>;
    if (!body.deviceId || !body.token) {
      throw new GatewayError(0, "pair 响应缺少 deviceId/token");
    }
    return { deviceId: body.deviceId, token: body.token };
  }

  /** GET /api/devices */
  async listDevices(): Promise<DeviceSummary[]> {
    const res = await this.request("/api/devices", { method: "GET" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GatewayError(res.status, text || `list devices failed (${res.status})`);
    }
    const body = (await res.json()) as { devices?: DeviceSummary[] } | DeviceSummary[];
    if (Array.isArray(body)) return body;
    return Array.isArray(body.devices) ? body.devices : [];
  }

  /** DELETE /api/devices/:deviceId (owner session). */
  async revokeDevice(deviceId: string): Promise<void> {
    if (!deviceId) throw new GatewayError(0, "deviceId 缺失");
    const res = await this.request(`/api/devices/${encodeURIComponent(deviceId)}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => "");
      throw new GatewayError(res.status, text || `revoke device failed (${res.status})`);
    }
  }

  // —— P1: memory ——
  listMemoryDocuments(input: { botId?: string; scope?: "bot" | "user" } = {}): Promise<MemoryDocument[]> {
    return this.callRpc<MemoryDocument[]>("memory.list", input).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  memoryBudget(botId: string): Promise<MemoryBudget> {
    return this.callRpc<MemoryBudget>("memory.budget", { botId });
  }

  updateMemoryDocument(input: {
    documentId: string;
    content: string;
    expectedRevision?: number;
  }): Promise<MemoryDocument> {
    return this.callRpc<MemoryDocument>("memory.update", input);
  }

  removeMemoryDocument(documentId: string): Promise<void> {
    return this.callRpc("memory.remove", { documentId });
  }

  exportMemoryMarkdown(botId?: string): Promise<unknown> {
    return this.callRpc("memory.exportMarkdown", botId ? { botId } : {});
  }

  memoryProviderConfig(): Promise<MemoryProviderConfig> {
    return this.callRpc<MemoryProviderConfig>("memory.providerConfig", {});
  }

  connectMemoryProvider(input: {
    provider: string;
    settings: Record<string, string>;
    credentials: Record<string, string>;
    defaultMemoryScope?: "isolated" | "shared";
  }): Promise<unknown> {
    return this.callRpc("memory.connectProvider", {
      defaultMemoryScope: "isolated",
      ...input,
    });
  }

  setMemoryDefaultScope(defaultMemoryScope: "isolated" | "shared"): Promise<unknown> {
    return this.callRpc("memory.setDefaultScope", { defaultMemoryScope });
  }

  disconnectMemoryProvider(): Promise<void> {
    return this.callRpc("memory.disconnectProvider", {});
  }

  // —— P1: boards / tickets ——
  listBoards(): Promise<Board[]> {
    return this.callRpc<Board[]>("boards.list", {}).then((rows) => (Array.isArray(rows) ? rows : []));
  }

  getBoard(): Promise<Board> {
    return this.callRpc<Board>("boards.get", {});
  }

  renameBoard(input: { name?: string; ticketPrefix?: string }): Promise<Board> {
    return this.callRpc<Board>("boards.rename", input);
  }

  listTickets(input: {
    boardId?: string;
    status?: TicketStatus;
    assigneeBotId?: string;
    q?: string;
  } = {}): Promise<Ticket[]> {
    return this.callRpc<{ tickets?: Ticket[] } | Ticket[]>("tickets.list", input).then((body) => {
      if (Array.isArray(body)) return body;
      return Array.isArray(body?.tickets) ? body.tickets : [];
    });
  }

  getTicket(input: { id: string } | { ref: string }): Promise<Ticket> {
    return this.callRpc<Ticket>("tickets.get", input);
  }

  createTicket(input: {
    boardId?: string;
    title: string;
    description?: string;
    priority?: TicketPriority;
    assigneeBotId: string;
  }): Promise<Ticket> {
    return this.callRpc<Ticket>("tickets.create", { priority: "normal", ...input });
  }

  updateTicket(input: {
    id: string;
    title?: string;
    description?: string;
    priority?: TicketPriority;
    status?: TicketStatus;
    assigneeBotId?: string;
  }): Promise<Ticket> {
    return this.callRpc<Ticket>("tickets.update", input);
  }

  moveTicket(input: { id: string; status: TicketStatus }): Promise<Ticket> {
    return this.callRpc<Ticket>("tickets.move", input);
  }

  commentTicket(input: { ticketId: string; body: string }): Promise<TicketComment> {
    return this.callRpc<TicketComment>("tickets.comment", input);
  }

  listTicketComments(ticketId: string): Promise<TicketComment[]> {
    return this.callRpc<TicketComment[]>("tickets.comments", { ticketId }).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  // —— P1: skills (taught) ——
  listTaughtSkills(botId: string): Promise<TaughtSkill[]> {
    return this.callRpc<TaughtSkill[]>("skills.list", { botId }).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  getTaughtSkill(skillId: string): Promise<TaughtSkill> {
    return this.callRpc<TaughtSkill>("skills.get", { skillId });
  }

  startTaughtSkill(input: { botId: string; goal: string }): Promise<TaughtSkill> {
    return this.callRpc<TaughtSkill>("skills.start", input);
  }

  appendTaughtSkillEvent(input: { skillId: string; event: Record<string, unknown> }): Promise<unknown> {
    return this.callRpc("skills.appendEvent", input);
  }

  snapshotTaughtSkill(skillId: string): Promise<TaughtSkill> {
    return this.callRpc<TaughtSkill>("skills.snapshot", { skillId });
  }

  stopTaughtSkill(skillId: string): Promise<TaughtSkill> {
    return this.callRpc<TaughtSkill>("skills.stop", { skillId });
  }

  updateTaughtSkillDraft(input: {
    skillId: string;
    name?: string;
    playbook: Record<string, unknown>;
  }): Promise<unknown> {
    return this.callRpc("skills.updateDraft", input);
  }

  saveTaughtSkill(input: { skillId: string; name?: string }): Promise<TaughtSkill> {
    return this.callRpc<TaughtSkill>("skills.save", input);
  }

  testRunTaughtSkill(input: { skillId: string; prompt?: string }): Promise<{ runId: string }> {
    return this.callRpc<{ runId: string }>("skills.testRun", input);
  }

  removeTaughtSkill(skillId: string): Promise<void> {
    return this.callRpc("skills.remove", { skillId });
  }

  // —— P1: agentSkills (sibling of skills) ——
  listAgentSkills(): Promise<AgentSkill[]> {
    return this.callRpc<AgentSkill[]>("agentSkills.list", {}).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  getAgentSkill(input: { skillId?: string; name?: string }): Promise<AgentSkill> {
    return this.callRpc<AgentSkill>("agentSkills.get", input);
  }

  createAgentSkill(
    input: { content: string } | { name: string; description: string; body?: string },
  ): Promise<AgentSkill> {
    return this.callRpc<AgentSkill>("agentSkills.create", input);
  }

  updateAgentSkill(input: {
    skillId: string;
    content?: string;
    name?: string;
    description?: string;
    body?: string;
  }): Promise<AgentSkill> {
    return this.callRpc<AgentSkill>("agentSkills.update", input);
  }

  removeAgentSkill(skillId: string): Promise<void> {
    return this.callRpc("agentSkills.remove", { skillId });
  }

  // —— P1: mcp ——
  listMcpServers(): Promise<McpServer[]> {
    return this.callRpc<McpServer[]>("mcp.servers.list", {}).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  createMcpServer(config: Record<string, unknown>): Promise<McpServer> {
    return this.callRpc<McpServer>("mcp.servers.create", config);
  }

  updateMcpServer(
    input: { id: string; config: Record<string, unknown> } | { id: string; secret: string },
  ): Promise<McpServer> {
    return this.callRpc<McpServer>("mcp.servers.update", input);
  }

  removeMcpServer(id: string): Promise<void> {
    return this.callRpc("mcp.servers.remove", { id });
  }

  testMcpServer(id: string): Promise<unknown> {
    return this.callRpc("mcp.servers.test", { id });
  }

  setMcpServerAgents(input: { id: string; allBots: boolean; botIds?: string[] }): Promise<unknown> {
    return this.callRpc("mcp.servers.agents", { botIds: [], ...input });
  }

  listMcpAssignments(botId: string): Promise<McpAssignment[]> {
    return this.callRpc<McpAssignment[]>("mcp.assignments.list", { botId }).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  listAllMcpAssignments(): Promise<unknown> {
    return this.callRpc("mcp.assignments.all", {});
  }

  approveMcpAssignment(input: { botId: string; serverId: string; threadId?: string }): Promise<unknown> {
    return this.callRpc("mcp.assignments.approve", input);
  }

  dismissMcpAssignment(input: { botId: string; serverId: string; threadId?: string }): Promise<unknown> {
    return this.callRpc("mcp.assignments.dismiss", input);
  }

  replaceMcpAssignments(input: {
    botId: string;
    assignments: { serverId: string; allowAllTools?: boolean; allowedTools?: string[] }[];
  }): Promise<unknown> {
    return this.callRpc("mcp.assignments.replace", input);
  }

  beginMcpOAuth(input: { serverId: string; redirectUri?: string }): Promise<unknown> {
    return this.callRpc("mcp.oauth.begin", input);
  }

  completeMcpOAuth(input: { sessionId: string; code: string; state: string }): Promise<unknown> {
    return this.callRpc("mcp.oauth.complete", input);
  }

  disconnectMcpOAuth(serverId: string): Promise<void> {
    return this.callRpc("mcp.oauth.disconnect", { serverId });
  }

  // —— P1: connections (Composio-style) ——
  connectionsCatalog(input: { query?: string; connectorId?: string } = {}): Promise<ConnectionCatalogEntry[]> {
    return this.callRpc<ConnectionCatalogEntry[]>("connections.catalog", input).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  listConnections(): Promise<AppConnection[]> {
    return this.callRpc<AppConnection[]>("connections.list", {}).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  beginConnection(input: {
    connectorId?: string;
    provider: string;
    displayName: string;
  }): Promise<unknown> {
    return this.callRpc("connections.begin", { connectorId: "composio", ...input });
  }

  completeConnection(input: { connectionId: string; code?: string }): Promise<unknown> {
    return this.callRpc("connections.complete", input);
  }

  renameConnection(input: { connectionId: string; displayName: string }): Promise<unknown> {
    return this.callRpc("connections.rename", input);
  }

  revokeConnection(connectionId: string): Promise<void> {
    return this.callRpc("connections.revoke", { connectionId });
  }

  connectionTools(input: { connectorId: string; provider: string }): Promise<unknown> {
    return this.callRpc("connections.tools", input);
  }

  // —— P1: capabilities ——
  listCapabilities(): Promise<CapabilityInstall[]> {
    return this.callRpc<CapabilityInstall[]>("capabilities.list", {}).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  catalogSearchCapabilities(input: { query?: string; usePublicCatalog?: boolean } = {}): Promise<unknown> {
    return this.callRpc("capabilities.catalogSearch", { query: "", usePublicCatalog: false, ...input });
  }

  installCapability(input: {
    kind: "skill" | "plugin" | "mcp" | "api" | "graphql";
    name: string;
    source: string;
    config?: Record<string, unknown>;
    credential?: string;
    pluginDigest?: string;
    pluginParts?: string[];
  }): Promise<CapabilityInstall> {
    return this.callRpc<CapabilityInstall>("capabilities.install", { config: {}, ...input });
  }

  setCapabilityPluginParts(input: { id: string; parts: string[] }): Promise<unknown> {
    return this.callRpc("capabilities.pluginParts", input);
  }

  previewCapabilityPlugin(source: string): Promise<unknown> {
    return this.callRpc("capabilities.pluginPreview", { source });
  }

  removeCapability(id: string): Promise<void> {
    return this.callRpc("capabilities.remove", { id });
  }

  // —— P1: artifacts (beyond create) ——
  listArtifacts(botId: string): Promise<ArtifactListItem[]> {
    return this.callRpc<ArtifactListItem[]>("artifacts.list", { botId }).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  listSpaceArtifacts(input: { botId?: string; cursor?: string; limit?: number } = {}): Promise<{
    items: ArtifactListItem[];
    nextCursor?: string | null;
  }> {
    return this.callRpc("artifacts.listSpace", input);
  }

  listArtifactVersions(familyId: string): Promise<ArtifactListItem[]> {
    return this.callRpc<ArtifactListItem[]>("artifacts.listVersions", { familyId }).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  getArtifact(
    target: ThreadTarget,
    artifactId: string,
  ): Promise<ArtifactListItem & { contentBase64?: string; content?: string }> {
    return this.callRpc("artifacts.get", { ...asTarget(target), artifactId });
  }

  getArtifactById(artifactId: string): Promise<ArtifactListItem> {
    return this.callRpc<ArtifactListItem>("artifacts.getById", { artifactId });
  }

  removeArtifact(artifactId: string): Promise<void> {
    return this.callRpc("artifacts.remove", { artifactId });
  }

  // —— P1: runs (list only) ——
  listRuns(filter: "active" | "recent" = "recent"): Promise<RunActivityRow[]> {
    return this.callRpc<{ runs?: RunActivityRow[] }>("runs.list", { filter }).then((body) =>
      Array.isArray(body?.runs) ? body.runs : [],
    );
  }

  // —— P1: preferences ——
  updatePreferences(input: PreferencesUpdateInput): Promise<unknown> {
    return this.callRpc("preferences.update", input);
  }

  adoptTimezone(timezone: string): Promise<unknown> {
    return this.callRpc("preferences.adoptTimezone", { timezone });
  }

  // —— P1: routines extras ——
  listRoutinesForMentions(botIds: string[]): Promise<RoutineMentionBatch[]> {
    return this.callRpc<RoutineMentionBatch[]>("routines.listForMentions", { botIds }).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  listRoutines(botId: string): Promise<unknown[]> {
    return this.callRpc<unknown[]>("routines.list", { botId }).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  routineHistory(input: {
    routineId: string;
    before?: { id: string; createdAt: string };
    limit?: number;
  }): Promise<RoutineHistoryPage> {
    return this.callRpc<RoutineHistoryPage>("routines.history", input);
  }

  // —— P1: computer deep ——
  computerStatus(botId: string): Promise<unknown> {
    return this.callRpc("computer.status", { botId });
  }

  recoverComputer(botId: string): Promise<ComputerInfo> {
    return this.callRpc("computer.recover", { botId }).then(() => this.fetchComputer(botId));
  }

  resetComputer(botId: string): Promise<ComputerInfo> {
    return this.callRpc("computer.reset", { botId }).then(() => this.fetchComputer(botId));
  }

  updateComputer(botId: string): Promise<ComputerInfo> {
    return this.callRpc("computer.update", { botId }).then(() => this.fetchComputer(botId));
  }

  listComputerUpdates(): Promise<unknown[]> {
    return this.callRpc<unknown[]>("computer.updates", {}).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  releaseInterruptedComputer(input: { id: string }): Promise<unknown> {
    return this.callRpc("computer.releaseInterrupted", { id: input.id, workersStopped: true });
  }

  dismissComputerUpdate(id: string): Promise<unknown> {
    return this.callRpc("computer.dismissUpdate", { id });
  }

  takeoverComputer(botId: string): Promise<ComputerTakeover> {
    return this.callRpc<ComputerTakeover>("computer.takeover", { botId });
  }

  releaseComputer(botId: string, reason?: "done" | "skipped"): Promise<unknown> {
    return this.callRpc("computer.release", reason ? { botId, reason } : { botId });
  }

  computerInput(
    botId: string,
    kind: "key" | "pointer" | "clipboard" | "scroll",
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    return this.callRpc("computer.input", { botId, kind, payload });
  }

  listComputerFiles(botId: string, path = "/"): Promise<ComputerFileEntry[]> {
    return this.callRpc<ComputerFileEntry[]>("computer.files", { botId, path }).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  readComputerFile(botId: string, path: string): Promise<{ path: string; content: string }> {
    return this.callRpc("computer.readFile", { botId, path });
  }

  downloadComputerFile(botId: string, path: string): Promise<{ path: string; contentBase64: string }> {
    return this.callRpc("computer.downloadFile", { botId, path });
  }

  uploadComputerFile(botId: string, path: string, contentBase64: string): Promise<unknown> {
    return this.callRpc("computer.uploadFile", { botId, path, contentBase64 });
  }

  computerTerminalUrl(botId: string): Promise<{ url: string | null }> {
    return this.callRpc("computer.terminalUrl", { botId });
  }

  computerCommands(botId: string): Promise<unknown[]> {
    return this.callRpc<unknown[]>("computer.commands", { botId }).then((rows) =>
      Array.isArray(rows) ? rows : [],
    );
  }

  computerScreenUrl(botId: string): Promise<{ url: string | null }> {
    return this.callRpc("computer.screenUrl", { botId });
  }


  computerHeartbeat(botId: string): Promise<unknown> {
    return this.callRpc("computer.heartbeat", { botId });
  }

  /* ========== P2 RPC (PICA-RPC-P2.md) ========== */

  // —— voice ——
  voiceCatalog(): Promise<VoiceCatalogEntry[]> {
    return this.callRpc<VoiceCatalogEntry[]>("voice.catalog", {}).then((r) =>
      Array.isArray(r) ? r : [],
    );
  }

  voiceStatus(input: SettingsScopeInput = {}): Promise<VoiceStatus> {
    return this.callRpc<VoiceStatus>("voice.status", input);
  }

  voiceCredentials(input: SettingsScopeInput = {}): Promise<VoiceCredential[]> {
    return this.callRpc<VoiceCredential[]>("voice.credentials", input).then((r) =>
      Array.isArray(r) ? r : [],
    );
  }

  voiceConnect(input: VoiceConnectInput): Promise<VoiceCredential> {
    return this.callRpc<VoiceCredential>("voice.connect", input);
  }

  async voiceDisconnect(provider: string): Promise<void> {
    await this.callRpc("voice.disconnect", { provider });
  }

  async voiceSetVoice(input: SettingsScopeInput & { voiceId: string; provider?: string }): Promise<unknown> {
    return this.callRpc("voice.setVoice", input);
  }

  async voiceSetSpeechModel(
    input: SettingsScopeInput & { provider: string; speechModel: string },
  ): Promise<unknown> {
    return this.callRpc("voice.setSpeechModel", input);
  }

  voiceVoices(input: SettingsScopeInput & { provider?: string } = {}): Promise<VoiceInfo[]> {
    return this.callRpc<VoiceInfo[]>("voice.voices", input).then((r) => (Array.isArray(r) ? r : []));
  }

  voicePrepare(input: {
    text: string;
    voiceId?: string;
    botId?: string;
    scope?: "account" | "space";
  }): Promise<VoicePrepareResult> {
    return this.callRpc<VoicePrepareResult>("voice.prepare", input);
  }

  // —— messaging (≠ connections.*) ——
  messagingInstallationsList(): Promise<MessagingInstallationsStatus> {
    return this.callRpc<MessagingInstallationsStatus>("messaging.installations.list", {});
  }

  messagingInstallationsStart(botId?: string): Promise<{ url: string }> {
    return this.callRpc("messaging.installations.start", botId ? { botId } : {});
  }

  async messagingInstallationsComplete(input: { state: string; code: string }): Promise<void> {
    await this.callRpc("messaging.installations.complete", input);
  }

  async messagingInstallationsRemove(id: string): Promise<void> {
    await this.callRpc("messaging.installations.remove", { id });
  }

  messagingStatus(): Promise<MessagingStatus> {
    return this.callRpc<MessagingStatus>("messaging.status", {});
  }

  messagingLinkStart(botId: string): Promise<{ code: string; expiresAt: string }> {
    return this.callRpc("messaging.link.start", { botId });
  }

  messagingIdentitiesSetBot(identityId: string, botId: string): Promise<MessagingLinkedIdentity> {
    return this.callRpc("messaging.identities.setBot", { identityId, botId });
  }

  async messagingIdentitiesUnlink(identityId: string): Promise<void> {
    await this.callRpc("messaging.identities.unlink", { identityId });
  }

  messagingChannelsList(): Promise<MessagingChannelMembership[]> {
    return this.callRpc<MessagingChannelMembership[]>("messaging.channels.list", {}).then((r) =>
      Array.isArray(r) ? r : [],
    );
  }

  messagingChannelsRespond(
    membershipId: string,
    accept: boolean,
  ): Promise<MessagingChannelMembership> {
    return this.callRpc("messaging.channels.respond", { membershipId, accept });
  }

  async messagingChannelsLeave(membershipId: string): Promise<void> {
    await this.callRpc("messaging.channels.leave", { membershipId });
  }

  messagingConnectionsList(): Promise<MessagingAgentConnection[]> {
    return this.callRpc<MessagingAgentConnection[]>("messaging.connections.list", {}).then((r) =>
      Array.isArray(r) ? r : [],
    );
  }

  messagingConnectionsRespond(
    connectionId: string,
    accept: boolean,
  ): Promise<MessagingAgentConnection> {
    return this.callRpc("messaging.connections.respond", { connectionId, accept });
  }

  async messagingConnectionsRevoke(connectionId: string): Promise<void> {
    await this.callRpc("messaging.connections.revoke", { connectionId });
  }

  // —— spaces ——
  spacesList(): Promise<SpaceNav> {
    return this.callRpc<SpaceNav>("spaces.list", {});
  }

  spacesCreate(name: string): Promise<SpaceRow> {
    return this.callRpc<SpaceRow>("spaces.create", { name });
  }

  spacesRename(spaceId: string, name: string): Promise<{ id: string; name: string }> {
    return this.callRpc("spaces.rename", { spaceId, name });
  }

  spacesRemove(spaceId: string): Promise<{ ok: true; activeSpaceId: string }> {
    return this.callRpc("spaces.remove", { spaceId });
  }

  // —— onboarding ——
  async onboardingSignupSurvey(input: SignupSurveyInput = {}): Promise<void> {
    await this.callRpc("onboarding.signupSurvey", input);
  }

  async onboardingStart(botId: string): Promise<void> {
    await this.callRpc("onboarding.start", { botId });
  }

  async onboardingPromptFocus(botId: string): Promise<void> {
    await this.callRpc("onboarding.promptFocus", { botId });
  }

  async onboardingChoose(botId: string, optionId: string): Promise<void> {
    await this.callRpc("onboarding.choose", { botId, optionId });
  }

  async onboardingDismissFocus(botId: string): Promise<void> {
    await this.callRpc("onboarding.dismissFocus", { botId });
  }

  async onboardingAppConnected(input: {
    botId: string;
    threadId?: string;
    messageId?: string;
    provider: string;
    connectorId?: string;
  }): Promise<void> {
    await this.callRpc("onboarding.appConnected", input);
  }

  // —— scratchpad ——
  scratchpadList(input: {
    botId: string;
    status?: ScratchpadItemStatus;
    includeDone?: boolean;
  }): Promise<ScratchpadItem[]> {
    return this.callRpc<ScratchpadItem[]>("scratchpad.list", input).then((r) =>
      Array.isArray(r) ? r : [],
    );
  }

  scratchpadCreate(input: {
    botId: string;
    title: string;
    status?: ScratchpadItemStatus;
    notes?: string;
  }): Promise<ScratchpadItem> {
    return this.callRpc<ScratchpadItem>("scratchpad.create", input);
  }

  scratchpadUpdate(input: {
    itemId: string;
    title?: string;
    status?: ScratchpadItemStatus;
    notes?: string;
  }): Promise<ScratchpadItem> {
    return this.callRpc<ScratchpadItem>("scratchpad.update", input);
  }

  async scratchpadRemove(itemId: string): Promise<void> {
    await this.callRpc("scratchpad.remove", { itemId });
  }

  // —— notifications (push only) ——
  async notificationsRegisterPush(token: string): Promise<void> {
    await this.callRpc("notifications.registerPush", { token });
  }

  async notificationsUnregisterPush(): Promise<void> {
    await this.callRpc("notifications.unregisterPush", {});
  }

  // —— export ——
  exportBot(botId: string): Promise<ExportManifest> {
    return this.callRpc<ExportManifest>("export.bot", { botId });
  }

  exportAccountToken(): Promise<{ token: string }> {
    return this.callRpc("export.accountToken", {});
  }

  // —— usage ——
  usageList(): Promise<UsageRecord[]> {
    return this.callRpc<UsageRecord[]>("usage.list", {}).then((r) => (Array.isArray(r) ? r : []));
  }

  usageSummary(): Promise<UsageSummary> {
    return this.callRpc<UsageSummary>("usage.summary", {});
  }

  // —— billing (contract present; instance billing:false → UI hidden/stub) ——
  billingStatus(): Promise<BillingStatus> {
    return this.callRpc<BillingStatus>("billing.status", {});
  }

  // —— security / audit / deployment ——
  securityEvents(input: {
    type?: string;
    ip?: string;
    userId?: string;
    cursor?: string;
    limit?: number;
  } = {}): Promise<SecurityEvent[]> {
    return this.callRpc<SecurityEvent[]>("security.events", input).then((r) =>
      Array.isArray(r) ? r : [],
    );
  }

  auditEvents(input: {
    from?: string;
    to?: string;
    spaceId?: string;
    actorId?: string;
    action?: string;
    cursor?: string;
    limit?: number;
  } = {}): Promise<AuditEventPage> {
    return this.callRpc<AuditEventPage>("audit.events", input);
  }

  deploymentGet(): Promise<DeploymentSettings> {
    return this.callRpc<DeploymentSettings>("deployment.get", {});
  }

  deploymentUpdate(input: {
    signupsEnabled?: boolean;
    signupAllowlist?: string[];
    computerHost?: "docker" | "this-mac" | null;
  }): Promise<DeploymentSettings> {
    return this.callRpc<DeploymentSettings>("deployment.update", input);
  }

  // —— vault + botSecrets + agentSecrets (no bare secrets) ——
  vaultList(input: SettingsScopeInput = {}): Promise<VaultSecretMeta[]> {
    return this.callRpc<VaultSecretMeta[]>("vault.list", input).then((r) =>
      Array.isArray(r) ? r : [],
    );
  }

  vaultPut(input: SettingsScopeInput & { destination: VaultPutDestination; value: string }): Promise<VaultSecretMeta> {
    return this.callRpc<VaultSecretMeta>("vault.put", input);
  }

  vaultReveal(input: SettingsScopeInput & { name: string }): Promise<VaultRevealed> {
    return this.callRpc<VaultRevealed>("vault.reveal", input);
  }

  async vaultRemove(input: SettingsScopeInput & { name: string }): Promise<void> {
    await this.callRpc("vault.remove", input);
  }

  botSecretsList(botId: string): Promise<VaultSecretMeta[]> {
    return this.callRpc<VaultSecretMeta[]>("botSecrets.list", { botId }).then((r) =>
      Array.isArray(r) ? r : [],
    );
  }

  botSecretsPut(input: {
    botId: string;
    destination: VaultPutDestination;
    value: string;
  }): Promise<VaultSecretMeta> {
    return this.callRpc<VaultSecretMeta>("botSecrets.put", input);
  }

  async botSecretsRemove(botId: string, name: string): Promise<void> {
    await this.callRpc("botSecrets.remove", { botId, name });
  }

  agentSecretsList(): Promise<AgentSecret[]> {
    return this.callRpc<AgentSecret[]>("agentSecrets.list", {}).then((r) =>
      Array.isArray(r) ? r : [],
    );
  }

  agentSecretsPut(name: string, value: string): Promise<AgentSecret> {
    return this.callRpc<AgentSecret>("agentSecrets.put", { name, value });
  }

  async agentSecretsRemove(id: string): Promise<void> {
    await this.callRpc("agentSecrets.remove", { id });
  }
  // —— updater (deployment owner) ——
  updaterStatus(): Promise<ServerUpdateStatus> {
    return this.callRpc<ServerUpdateStatus>("updater.status", {});
  }

  updaterCheck(input: ServerUpdateRequest = {}): Promise<ServerUpdateCheck> {
    return this.callRpc<ServerUpdateCheck>("updater.check", input);
  }

  updaterApply(input: ServerUpdateRequest = {}): Promise<ServerUpdateRun> {
    return this.callRpc<ServerUpdateRun>("updater.apply", input);
  }

}
