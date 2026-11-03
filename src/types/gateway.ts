/** Wire types for Pica ↔ Rakazo RPC (threads.*, groups.list, ProductEvent, /api/auth). */

/** GET /api/auth/capabilities — drives login UI (no signupsEnabled field). */
export type AuthCapabilities = {
  passwordAuth: boolean;
  passwordReset: boolean;
  resetUrl: string | null;
  emailCode: boolean;
  /** Present when OIDC configured; `available` reflects discovery. */
  sso: { name: string; available: boolean } | null;
  billing?: boolean;
  passkeyRpId?: string | null;
  nativePasskeys?: { ios: boolean; android: boolean };
  crispWebsiteId?: string | null;
};

export type ReportLine = { system: string; result: string; count?: string };
export type ReportPayload = { lines: ReportLine[]; closing?: string };
export type ScreenshotPayload = {
  url: string;
  width: number;
  height: number;
  caption?: string;
};
/** Answer strings for ask cards with actions (Rakazo threads.answer). */
export type ApprovalAnswer = "allow" | "deny" | "always";

export type ApprovalPayload = {
  /** Ask block `approvalEffectId` (string Id). Used for display / correlation, not the answer RPC key. */
  approvalEffectId: string;
  runId: string;
  messageId: string;
  action: string;
  detail?: string;
  status: "pending" | "answered";
  site?: string;
  /** True when actions include an `always` id. */
  canRemember?: boolean;
  actions?: { id: string; label: string }[];
  answer?: string;
};

export type ApprovalResolvedPayload = {
  approvalEffectId: string;
  action: string;
  decision: ApprovalAnswer;
  answer?: string;
};

export type MemoryPayload = {
  rule: string;
  diff: string;
  total: number;
  removed?: boolean;
  by?: "operator";
};

export type RoutineMode = "act" | "watch";

export type RoutinePayload = {
  routineId: string;
  name: string;
  cron: string;
  human: string;
  webhook?: boolean;
  mode?: RoutineMode;
};

export type QuestionOption = { id: string; letter: string; label: string };

export type QuestionPayload = {
  question: string;
  subtitle?: string;
  options: QuestionOption[];
  /** Choice blocks are single-select; free-text asks use empty options. */
  multi: boolean;
  status: "open" | "answered";
  answerId?: string;
  runId: string;
  messageId: string;
};

export type BotRefPayload = { from: string; fromName: string; content: string };
export type LoginPayload = { site: string; why?: string };
export type WebhookPayload = { routineId: string; name: string; body: string };
export type ActivityStep = { tool: string; summary: string; ok?: boolean; ms?: number };
export type ActivityPayload = { steps: ActivityStep[]; done: boolean };

export type ComputerRoutine = {
  id: string;
  name: string;
  cron: string;
  human: string;
  last_run_at: number | null;
  enabled: number;
  webhook_path?: string | null;
  webhook_secret?: string | null;
  mode?: RoutineMode;
  /** routines.list prompt — needed for edit forms. */
  prompt?: string;
  timezone?: string;
  notify?: boolean;
  webhookEnabled?: boolean;
  githubEnabled?: boolean;
  messageProvider?: string | null;
  editable?: boolean;
};

/** contracts CreateRoutineInput (minimal UI fields + optional triggers). */
export type CreateRoutineInput = {
  botId: string;
  name: string;
  prompt: string;
  crons?: string[];
  timezone?: string;
  notify?: boolean;
  active?: boolean;
  webhookEnabled?: boolean;
  githubEnabled?: boolean;
  messageProvider?: string | null;
};

/** contracts routines.update input (partial). */
export type UpdateRoutineInput = {
  routineId: string;
  name?: string;
  prompt?: string;
  crons?: string[];
  timezone?: string;
  active?: boolean;
  notify?: boolean;
  webhookEnabled?: boolean;
  githubEnabled?: boolean;
  messageProvider?: string | null;
};

/** contracts approvalRules.set (create/upsert). effect is always_allow | deny only. */
export type CreateApprovalRuleInput = {
  effect: "always_allow" | "deny";
  matchKind: "tool" | "connector" | "site";
  matchValue: string;
};

export type DeviceSummary = {
  deviceId: string;
  name: string;
  connected: boolean;
};

export type DevicePairResult = {
  deviceId: string;
  token: string;
};

export type Skill = { name: string; description: string };

export type ActionEntry = {
  id: number;
  thread_id: string;
  trigger: string;
  tool: string;
  summary: string;
  ok: boolean | null;
  ms: number | null;
  created_at: number;
};

/** Rakazo approvalRules.list row (ActionApprovalRuleSchema). */
export type ApprovalRule = {
  id: string;
  effect: "always_allow" | "require_approval" | "deny";
  matchKind: "tool" | "connector" | "category" | "site";
  matchValue: string;
  createdAt: string;
};

export type ApprovalMode = "never" | "auto" | "ask";

/** Rakazo autoReview.get / set. */
export type AutoReviewSettings = {
  mode: ApprovalMode;
  enabled: boolean;
  checkerAvailable: boolean;
  skipApprovals: boolean;
};

export type ModelCatalogEntry = {
  protocol?: "chat" | "decisions";
  recommended?: boolean;
  credentialIds?: string[];
  managed?: boolean;
  provider: string;
  providerName?: string;
  id: string;
  label: string;
  billing: string;
  auth?: "api-key" | "oauth" | "both";
  reasoning?: boolean;
  images?: boolean;
  placeholder?: boolean;
  live?: true;
};

export type ModelRoleChoice = {
  provider: string;
  modelId: string;
  thinkingLevel?: string | null;
  credentialId?: string;
};

export type ModelRoleView = {
  primary: ModelRoleChoice | null;
  backups: ModelRoleChoice[];
  deploymentPrimary?: ModelRoleChoice | null;
};

export type ArtifactMeta = {
  id: string;
  botId: string | null;
  groupId: string | null;
  runId: string | null;
  name: string;
  description: string | null;
  mimeType: string;
  size: number;
  version: number;
  createdAt: string;
};

/** threads.send mentions: bare bot id or structured chip. */
export type SendMention =
  | string
  | { kind: "bot" | "group" | "routine" | "connector"; id: string };

export type SendMessageInput = {
  text?: string;
  artifactIds?: string[];
  mentions?: SendMention[];
  /** threads.send replyToMessageId */
  replyToMessageId?: string;
  /** Optional quote excerpt (max 2000). Requires replyToMessageId. */
  replyQuote?: string;
  clientNonce?: string;
};

export type UpdateBotInput = {
  botId: string;
  name?: string;
  description?: string;
  instructions?: string;
  color?: string;
  notifyOnFinish?: boolean;
  pinned?: boolean;
};

export type UsageTotals = { prompt: number; completion: number; cached: number; total: number };

export type ComputerState = "stopped" | "booting" | "running" | "suspended" | "error";

export type ComputerInfo = {
  botId: string;
  running: boolean;
  state?: ComputerState;
  kind?: string;
  mode?: string;
  vncUrl: string | null;
  terminalUrl?: string | null;
  screen?: { kind: "vnc"; url: string } | { kind: "cdp"; url: string } | null;
  screenAvailable?: boolean;
  terminalAvailable?: boolean;
  controlHolder?: "bot" | "user" | "none";
  takeoverRequested?: boolean;
  window?: boolean;
  shell?: { enabled: boolean; available: boolean; why?: string };
  error?: string;
  /** Gaps vs contracts: no shell toggle / window RPC on stock Rakazo. */
  gaps?: string[];
  routines: ComputerRoutine[];
  usage?: { today: UsageTotals; budget: number };
  rules?: ApprovalRule[];
  memory?: string[];
  skills?: Skill[];
  actions?: ActionEntry[];
};

export type RoutineAction = "run" | "pause" | "resume" | "delete";

export type MessageKind =
  | "text"
  | "report"
  | "screenshot"
  | "approval_request"
  | "approval_resolved"
  | "memory_updated"
  | "routine_created"
  | "bot_ref"
  | "login_request"
  | "activity"
  | "question"
  | "webhook";

export type MessagePayload =
  | ReportPayload
  | ScreenshotPayload
  | ApprovalPayload
  | ApprovalResolvedPayload
  | MemoryPayload
  | RoutinePayload
  | BotRefPayload
  | LoginPayload
  | ActivityPayload
  | QuestionPayload
  | WebhookPayload
  | null;

/** UI message derived from Rakazo ThreadMessage / ProductEvent. */
/** Compact parent preview for reply chrome (Rakazo ReplyPreview). */
export type ReplyPreview = {
  role?: "user" | "bot" | "system";
  botId?: string;
  text: string;
  attachment?: {
    kind: "image" | "file";
    artifactId: string;
    mimeType: string;
    name: string;
  };
};

export type Message = {
  id: string;
  thread_id: string;
  sender: string;
  kind: MessageKind;
  content: string;
  payload: MessagePayload;
  created_at: number;
  /** Rakazo seq when known. */
  seq?: number;
  /** Needed for threads.answer. */
  runId?: string;
  replyToMessageId?: string;
  replyQuote?: string;
  /** null = parent unavailable; undefined = not a reply / unknown. */
  replyPreview?: ReplyPreview | null;
};

/** Exactly one of botId | groupId for threads.* */
export type ThreadTarget =
  | { botId: string; groupId?: undefined }
  | { botId?: undefined; groupId: string };

export type MessageBlock =
  | { kind: "text"; text: string }
  | {
      kind: "ask";
      text: string;
      approvalEffectId?: string;
      detail?: string;
      site?: string;
      status?: "pending" | "answered";
      answer?: string;
      actions?: { id: string; label: string }[];
      input?: "text" | "secret";
      [k: string]: unknown;
    }
  | {
      kind: "choice";
      question: string;
      subtitle?: string;
      options: { id: string; letter: string; label: string }[];
      answerId?: string;
    }
  | { kind: "card"; lines: { k: string; v: string }[] }
  | { kind: string; [k: string]: unknown };

export type ThreadMessage = {
  id: string;
  threadId: string;
  seq: number;
  role: "user" | "bot" | "system";
  blocks: MessageBlock[];
  botId?: string;
  runId?: string;
  replyToMessageId?: string;
  replyQuote?: string;
  replyPreview?: ReplyPreview | null;
  createdAt: string;
};

export type ThreadMessagePage = {
  threadId: string;
  messages: ThreadMessage[];
  olderCursor: number | null;
  coveredThroughSeq?: number;
};

export type ThreadHead = { threadId: string; cursor: number };

/** contracts ThreadSnapshotSchema (subset used by Pica). */
export type ThreadSnapshot = {
  threadId: string;
  cursor: number;
  messages: ThreadMessage[];
  olderCursor: number | null;
  botId?: string;
  groupId?: string;
  groupName?: string;
  members?: GroupMember[];
  run?: unknown;
  activeRuns?: unknown[];
  computer?: unknown;
};

export type MessageReaction = "👍" | "👎" | "❤️" | "😂" | "🎉" | "😮";

export type SearchHitKind = "conversation" | "message" | "file" | "link" | "routine";

export type SearchHit = {
  kind: SearchHitKind;
  botId?: string;
  botName?: string;
  groupId?: string;
  groupName?: string;
  title: string;
  snippet: string;
  messageId?: string;
  seq?: number;
  artifactId?: string;
  routineId?: string;
  url?: string;
};

export type SearchQueryOutput = { hits: SearchHit[] };

export type ModelCredential = {
  id: string;
  provider: string;
  label: string;
  hasKey: boolean;
  isDefault: boolean;
  preferenceRank?: number;
  headerNames?: string[];
  baseUrl?: string;
  apiProtocol?: "chat-completions" | "responses" | "anthropic-messages";
  accountId?: string;
  gatewayId?: string;
  modelId?: string;
  reasoning?: boolean;
  thinkingLevel?: string | null;
  maxTokens?: number;
  supportsImages?: boolean;
  maxImagesPerPrompt?: number;
  thinkingLevels?: string[];
  enabledModelIds?: string[];
  authKind?: "api_key" | "oauth" | "openai_compatible";
  reconnectRequired?: boolean;
};

export type ModelConnectInput = {
  provider: string;
  apiKey?: string;
  accountId?: string;
  gatewayId?: string;
  headers?: Record<string, string>;
  baseUrl?: string;
  apiProtocol?: "chat-completions" | "responses" | "anthropic-messages";
  label?: string;
  credentialId?: string | null;
  modelId?: string;
  reasoning?: boolean;
  thinkingLevel?: string | null;
  makeDefault?: boolean;
  maxTokens?: number | null;
  supportsImages?: boolean;
  maxImagesPerPrompt?: number | null;
  enabledModelIds?: string[];
};

export type ModelRoleUpdate = {
  primary?: ModelRoleChoice | null;
  backups?: ModelRoleChoice[];
};

export type UpdateGroupInput = {
  groupId: string;
  name?: string;
  botIds?: string[];
  expectedBotIds?: string[];
  pinned?: boolean;
  sectionId?: string | null;
};

export type AppBootstrap = {
  me: RakazoMeLoose;
  bots: unknown[];
  groups: Group[];
  botSections?: unknown[];
  archivedBots?: unknown[];
  archivedGroups?: Group[];
  thread?: ThreadSnapshot | null;
  routines?: unknown[];
  spaces?: unknown[];
};

/** Loose me shape from bootstrap/me (contracts MeSchema subset). */
export type RakazoMeLoose = {
  user?: { id?: string; email?: string; name?: string };
  email?: string;
  name?: string;
  id?: string;
  [k: string]: unknown;
};


export type GroupMember = {
  botId: string;
  name: string;
  color?: string;
  avatarSet?: string;
  status?: string;
};

/** Rakazo groups.list row. */
export type Group = {
  id: string;
  spaceId?: string;
  name: string;
  pinned?: boolean;
  sectionId?: string | null;
  archivedAt?: string | null;
  members: GroupMember[];
  threadId: string;
  preview: string;
  unread: boolean;
  updatedAt?: string;
  createdAt?: string;
};

export type Bot = {
  id: string;
  name: string;
  role: string;
  emoji: string;
  thread_id: string;
  last_message: Message | null;
};

/** thinking / waiting / blocked / idle from run/meta events; done is local. */
export type BotStatus = "thinking" | "waiting" | "blocked" | "idle" | "done";

/** Rakazo ProductEvent (subset fields used by Pica). */
export type ProductEvent = {
  id: string;
  spaceId?: string;
  threadId: string;
  botId?: string;
  seq: number;
  type: string;
  runId?: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

export type ConnectionState = "idle" | "connecting" | "live" | "reconnecting" | "error";


/** P1 — memory documents (memory.list). */
export type MemoryDocument = {
  id: string;
  botId?: string | null;
  scope?: "bot" | "user";
  /** Document path e.g. MEMORY.md — primary label in UI. */
  path?: string;
  title?: string;
  content?: string;
  revision?: number;
  updatedAt?: string;
};

export type MemoryBudget = {
  botId?: string;
  /** Contract: MemoryPromptBudgetSchema */
  usedBytes?: number;
  limitBytes?: number;
  /** Legacy / loose aliases */
  used?: number;
  limit?: number;
  percentUsed?: number;
  documents?: unknown[];
  omitted?: unknown[];
  [k: string]: unknown;
};

export type MemoryProviderConfig = {
  provider?: string | null;
  defaultMemoryScope?: "isolated" | "shared";
  [k: string]: unknown;
};

export type Board = {
  id: string;
  name: string;
  ticketPrefix?: string;
  [k: string]: unknown;
};

export type TicketStatus = "todo" | "doing" | "review" | "blocked" | "done" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export type Ticket = {
  id: string;
  boardId?: string;
  ref?: string;
  title: string;
  description?: string | null;
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeBotId?: string | null;
  [k: string]: unknown;
};

export type TicketComment = {
  id: string;
  ticketId?: string;
  body: string;
  authorName?: string | null;
  createdAt?: string;
  [k: string]: unknown;
};

/** Taught / demo skill (skills.*). */
export type TaughtSkill = {
  id: string;
  botId?: string;
  name?: string;
  status?: string;
  goal?: string;
  [k: string]: unknown;
};

/** Claude Agent Skill catalog entry (agentSkills.*). */
export type AgentSkill = {
  id: string;
  name: string;
  description?: string;
  body?: string;
  content?: string;
  [k: string]: unknown;
};

export type McpServer = {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  transport?: string;
  [k: string]: unknown;
};

export type McpAssignment = {
  serverId: string;
  allowAllTools?: boolean;
  allowedTools?: string[];
  [k: string]: unknown;
};

export type ConnectionCatalogEntry = {
  id?: string;
  connectorId?: string;
  provider?: string;
  displayName?: string;
  [k: string]: unknown;
};

export type AppConnection = {
  id: string;
  connectorId?: string;
  provider?: string;
  displayName?: string;
  status?: string;
  [k: string]: unknown;
};

export type CapabilityInstall = {
  id: string;
  kind?: string;
  name?: string;
  source?: string;
  [k: string]: unknown;
};

export type ArtifactListItem = ArtifactMeta & {
  familyId?: string;
  version?: number;
  createdAt?: string;
};

export type RunActivityRow = {
  id: string;
  botId?: string;
  threadId?: string;
  status?: string;
  createdAt?: string;
  [k: string]: unknown;
};

export type PreferencesUpdateInput = {
  avatarStyle?: "robot" | "organic";
  timezone?: string | null;
  locale?: string;
};

export type RoutineMentionBatch = {
  botId: string;
  routines: ComputerRoutine[];
};

export type RoutineHistoryPage = {
  runs: unknown[];
  nextCursor?: { id: string; createdAt: string } | null;
};

export type ComputerFileEntry = {
  path: string;
  kind: "file" | "dir";
  size?: number;
};

export type ComputerTakeover = { leaseId: string; expiresAt: string };

export type GatewayConfig = {
  /** Origin only (no path). e.g. https://rakazo.caiaiu.com or http://127.0.0.1:45173 — never :3100 */
  baseUrl: string;
  /**
   * Optional session / bearer token. Preferred auth is same-origin cookie via the Tauri shell.
   * Kept for native / advanced use; not required for isConfigured.
   */
  token: string;
};


/* ========== P2 — voice / messaging / spaces / onboarding / scratchpad / … ========== */

export type SettingsScope = "account" | "space";
export type SettingsScopeInput = { scope?: SettingsScope };

export type VoiceCatalogEntry = {
  id: string;
  name: string;
  description?: string;
  transcribe?: boolean;
  keyless?: boolean;
};

export type VoiceStatus = {
  configured?: boolean;
  ready?: boolean;
  transcribe?: boolean;
  provider?: string | null;
  voiceId?: string | null;
};

export type VoiceCredential = {
  provider: string;
  voiceId?: string | null;
  speechModel?: string | null;
  baseUrl?: string | null;
  [key: string]: unknown;
};

export type VoiceInfo = {
  id: string;
  label?: string;
  name?: string;
  [key: string]: unknown;
};

export type VoiceConnectInput = {
  provider: string;
  apiKey?: string;
  voiceId?: string;
  speechModel?: string;
  baseUrl?: string;
  ttsModel?: string;
  sttModel?: string;
  scope?: SettingsScope;
};

export type VoicePrepareResult = {
  ready?: boolean;
  utterances?: unknown[];
  [key: string]: unknown;
};

export type MessagingInstallationsStatus = {
  available?: boolean;
  personalLinkAvailable?: boolean;
  installations?: Array<{ id: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

export type MessagingStatus = {
  enabled?: boolean;
  providers?: unknown[];
  addresses?: unknown;
  openSignup?: boolean;
  identities?: unknown[];
  [key: string]: unknown;
};

export type MessagingLinkedIdentity = {
  id?: string;
  identityId?: string;
  botId?: string | null;
  [key: string]: unknown;
};

export type MessagingChannelMembership = {
  id?: string;
  membershipId?: string;
  [key: string]: unknown;
};

export type MessagingAgentConnection = {
  id?: string;
  connectionId?: string;
  [key: string]: unknown;
};

export type SpaceNav = {
  current?: { id: string; name?: string; [key: string]: unknown } | null;
  spaces?: Array<{ id: string; name: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

export type SpaceRow = {
  id: string;
  name: string;
  [key: string]: unknown;
};

export type SignupSurveyInput = {
  reason?: string;
  use?: "personal" | "work" | "both";
  teamSize?: "1" | "2-10" | "11-50" | "51-200" | "201+";
  source?: string;
};

export type ScratchpadItemStatus = "open" | "parked" | "done";

export type ScratchpadItem = {
  id: string;
  botId?: string;
  title: string;
  status?: ScratchpadItemStatus;
  notes?: string;
  [key: string]: unknown;
};

export type UsageRecord = {
  id?: string;
  model?: string;
  tokens?: number;
  cost?: number;
  [key: string]: unknown;
};

export type UsageSummary = {
  totalTokens?: number;
  totalCost?: number;
  byModel?: unknown[];
  [key: string]: unknown;
};

export type ExportManifest = {
  version?: number | string;
  botId?: string;
  [key: string]: unknown;
};

export type SecurityEvent = {
  id?: string;
  type?: string;
  createdAt?: string;
  [key: string]: unknown;
};

export type AuditEventPage = {
  events?: Array<Record<string, unknown>>;
  nextCursor?: string | null;
  [key: string]: unknown;
};

export type DeploymentSettings = {
  ownerUserId?: string;
  signupsEnabled?: boolean;
  signupAllowlist?: string[];
  computerHost?: "docker" | "this-mac" | null;
  sandboxProvider?: string | null;
  [key: string]: unknown;
};

export type VaultSecretMeta = {
  name: string;
  origin?: string;
  auth?: string;
  [key: string]: unknown;
};

export type VaultPutDestination = {
  name: string;
  origin?: string;
  auth: "bearer" | "header" | "basic" | "login" | "command" | string;
};

export type VaultRevealed = {
  value?: string;
  fields?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AgentSecret = {
  id: string;
  name: string;
  [key: string]: unknown;
};

export type ServerUpdateStrategy = "pull" | "build" | "checkout";
export type ServerUpdateMode = "sidecar" | "checkout" | "unavailable";
export type ServerUpdateInstallKind = "sidecar" | "compose" | "source";

export type ServerUpdateSource = {
  repoUrl: string;
  branch: string;
  official: boolean;
};

export type ServerUpdateStep = {
  id: string;
  label: string;
  ok: boolean;
  exitCode?: number | null;
  output?: string;
};

export type ServerUpdateRun = {
  startedAt?: string;
  finishedAt?: string | null;
  ok: boolean;
  fromCommit?: string | null;
  toCommit?: string | null;
  fromTag?: string | null;
  toTag?: string | null;
  strategy?: ServerUpdateStrategy | null;
  repoUrl?: string;
  branch?: string;
  restart?: "recreated" | "supervised" | "manual" | "not-required";
  restartAdvice?: string;
  error?: string | null;
  steps?: ServerUpdateStep[];
  [key: string]: unknown;
};

export type ServerUpdateStatus = {
  supported: boolean;
  unsupportedReason?: string | null;
  installKind: ServerUpdateInstallKind;
  manualCommands?: string[];
  mode: ServerUpdateMode;
  strategy?: ServerUpdateStrategy | null;
  strategyNote?: string | null;
  version: string;
  revision?: string | null;
  commit?: string | null;
  branch?: string | null;
  remoteUrl?: string | null;
  dirty?: boolean;
  dirtyPaths?: string[];
  image?: string | null;
  imageTag?: string | null;
  previousImageTag?: string | null;
  canRollback?: boolean;
  source?: ServerUpdateSource;
  officialRepoUrl?: string;
  restartSupervisor?: "systemd" | "pm2" | "declared" | "none" | string;
  restartAdvice?: string;
  running?: boolean;
  lastRun?: ServerUpdateRun | null;
  [key: string]: unknown;
};

export type ServerUpdateCheck = {
  status: "unavailable" | "dirty" | "up-to-date" | "available";
  reason?: string | null;
  changed?: string[];
  commit?: string | null;
  targetCommit?: string | null;
  targetTag?: string | null;
  behindBy?: number;
  [key: string]: unknown;
};

export type ServerUpdateRequest = {
  repoUrl?: string;
  branch?: string;
};

/** Billing exists in contract; this instance has capabilities.billing=false — UI hidden. */
export type BillingStatus = Record<string, unknown>;
