/** Map Rakazo ThreadMessage / ProductEvent → Pica UI Message + status. */

import type {
  ApprovalAnswer,
  ApprovalPayload,
  ApprovalResolvedPayload,
  BotStatus,
  Message,
  MessageBlock,
  MessageKind,
  MessagePayload,
  ProductEvent,
  QuestionPayload,
  ThreadMessage,
} from "@/types/gateway";

function blocksText(blocks: MessageBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.kind === "text" && typeof b.text === "string") parts.push(b.text);
    else if (b.kind === "ask" && typeof b.text === "string") parts.push(b.text);
    else if (b.kind === "choice" && typeof b.question === "string") parts.push(b.question);
    else if (b.kind === "card" && Array.isArray(b.lines)) {
      parts.push(b.lines.map((l) => `${l.k}: ${l.v}`).join("\n"));
    }
  }
  return parts.join("\n\n").trim();
}

function asAsk(block: MessageBlock): Extract<MessageBlock, { kind: "ask" }> | null {
  if (block.kind !== "ask") return null;
  // Narrow past catch-all `{ kind: string }` member of MessageBlock.
  return block as Extract<MessageBlock, { kind: "ask" }>;
}

function asChoice(block: MessageBlock): Extract<MessageBlock, { kind: "choice" }> | null {
  if (block.kind !== "choice") return null;
  return block as Extract<MessageBlock, { kind: "choice" }>;
}

function decisionFromAnswer(answer?: string): ApprovalAnswer {
  const a = (answer || "").trim().toLowerCase();
  if (a === "deny" || a === "discard" || a === "reject") return "deny";
  if (a === "always") return "always";
  return "allow";
}

function mapAsk(
  ask: Extract<MessageBlock, { kind: "ask" }>,
  messageId: string,
  runId: string,
): { kind: MessageKind; payload: MessagePayload; content: string } | null {
  const text = typeof ask.text === "string" ? ask.text : "";
  if (!text && !ask.approvalEffectId) return null;
  const approvalEffectId =
    typeof ask.approvalEffectId === "string" ? ask.approvalEffectId : "";
  const actions = Array.isArray(ask.actions)
    ? ask.actions
        .filter((a) => a && typeof a.id === "string")
        .map((a) => ({ id: String(a.id), label: String(a.label ?? a.id) }))
    : undefined;
  const status = ask.status === "answered" ? "answered" : "pending";
  const canRemember = Boolean(actions?.some((a) => a.id === "always"));

  // Tool / fetch / MCP approvals carry approvalEffectId (and usually actions).
  if (approvalEffectId || (actions && actions.length > 0)) {
    if (status === "answered") {
      const payload: ApprovalResolvedPayload = {
        approvalEffectId: approvalEffectId || messageId,
        action: text,
        decision: decisionFromAnswer(ask.answer),
        answer: typeof ask.answer === "string" ? ask.answer : undefined,
      };
      return { kind: "approval_resolved", payload, content: text };
    }
    const payload: ApprovalPayload = {
      approvalEffectId: approvalEffectId || messageId,
      runId,
      messageId,
      action: text,
      detail: typeof ask.detail === "string" ? ask.detail : undefined,
      status: "pending",
      site: typeof ask.site === "string" ? ask.site : undefined,
      canRemember,
      actions,
    };
    return { kind: "approval_request", payload, content: text };
  }

  // Free-text / secret ask without effect id — render as question shell.
  const payload: QuestionPayload = {
    question: text,
    options: [],
    multi: false,
    status: status === "answered" ? "answered" : "open",
    answerId: typeof ask.answer === "string" ? ask.answer : undefined,
    runId,
    messageId,
  };
  return { kind: "question", payload, content: text };
}

function mapChoice(
  choice: Extract<MessageBlock, { kind: "choice" }>,
  messageId: string,
  runId: string,
): { kind: MessageKind; payload: MessagePayload; content: string } {
  const options = Array.isArray(choice.options)
    ? choice.options.map((o) => ({
        id: String(o.id),
        letter: String(o.letter ?? ""),
        label: String(o.label ?? o.id),
      }))
    : [];
  const answered = typeof choice.answerId === "string" && choice.answerId.length > 0;
  const payload: QuestionPayload = {
    question: choice.question,
    subtitle: choice.subtitle,
    options,
    multi: false,
    status: answered ? "answered" : "open",
    answerId: answered ? choice.answerId : undefined,
    runId,
    messageId,
  };
  return { kind: "question", payload, content: choice.question };
}

const REPLY_QUOTE_MAX = 2000;

export function truncateReplyQuote(value: string): string {
  const truncated = value.slice(0, REPLY_QUOTE_MAX);
  const last = truncated.charCodeAt(truncated.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? truncated.slice(0, -1) : truncated;
}

function pickReplyFields(source: {
  replyToMessageId?: unknown;
  replyQuote?: unknown;
  replyPreview?: unknown;
}): Pick<Message, "replyToMessageId" | "replyQuote" | "replyPreview"> {
  const out: Pick<Message, "replyToMessageId" | "replyQuote" | "replyPreview"> = {};
  if (typeof source.replyToMessageId === "string" && source.replyToMessageId) {
    out.replyToMessageId = source.replyToMessageId;
  }
  if (typeof source.replyQuote === "string" && source.replyQuote.trim()) {
    out.replyQuote = truncateReplyQuote(source.replyQuote.trim());
  }
  if (source.replyPreview === null) {
    out.replyPreview = null;
  } else if (source.replyPreview && typeof source.replyPreview === "object") {
    const p = source.replyPreview as Record<string, unknown>;
    const text = typeof p.text === "string" ? p.text : "";
    const preview: NonNullable<Message["replyPreview"]> = { text };
    if (typeof p.botId === "string") preview.botId = p.botId;
    if (p.role === "user" || p.role === "bot" || p.role === "system") preview.role = p.role;
    if (p.attachment && typeof p.attachment === "object") {
      const a = p.attachment as Record<string, unknown>;
      if (
        (a.kind === "image" || a.kind === "file") &&
        typeof a.artifactId === "string" &&
        typeof a.mimeType === "string" &&
        typeof a.name === "string"
      ) {
        preview.attachment = {
          kind: a.kind,
          artifactId: a.artifactId,
          mimeType: a.mimeType,
          name: a.name,
        };
      }
    }
    out.replyPreview = preview;
  }
  return out;
}

export function mapThreadMessage(m: ThreadMessage): Message {
  let kind: MessageKind = "text";
  let payload: MessagePayload = null;
  let content = blocksText(m.blocks);
  const runId = typeof m.runId === "string" ? m.runId : "";

  const askBlock = m.blocks.map(asAsk).find(Boolean) ?? null;
  const choiceBlock = m.blocks.map(asChoice).find(Boolean) ?? null;

  if (askBlock) {
    const mapped = mapAsk(askBlock, m.id, runId);
    if (mapped) {
      kind = mapped.kind;
      payload = mapped.payload;
      content = mapped.content || content;
    }
  } else if (choiceBlock) {
    const mapped = mapChoice(choiceBlock, m.id, runId);
    kind = mapped.kind;
    payload = mapped.payload;
    content = mapped.content || content;
  }

  const created = Date.parse(m.createdAt);
  return {
    id: m.id,
    thread_id: m.threadId,
    sender: m.role === "user" ? "user" : m.botId || m.role,
    kind,
    content,
    payload,
    created_at: Number.isFinite(created) ? created : Date.now(),
    seq: m.seq,
    runId: runId || undefined,
    ...pickReplyFields(m),
  };
}

/** Build a UI Message from thread.message.* (and ask/choice lifecycle) payloads. */
export function messageFromProductEvent(ev: ProductEvent): Message | null {
  if (
    ev.type === "thread.message.created" ||
    ev.type === "thread.message.updated" ||
    ev.type === "thread.message.finalized"
  ) {
    const p = ev.payload;
    const blocks = (Array.isArray(p.blocks) ? p.blocks : []) as MessageBlock[];
    const role = (typeof p.role === "string" ? p.role : "bot") as ThreadMessage["role"];
    const messageId = typeof p.messageId === "string" ? p.messageId : ev.id;
    const tm: ThreadMessage = {
      id: messageId,
      threadId: ev.threadId,
      seq: typeof p.seq === "number" ? p.seq : ev.seq,
      role,
      blocks,
      botId: typeof p.botId === "string" ? p.botId : ev.botId,
      runId: typeof p.runId === "string" ? p.runId : ev.runId,
      createdAt: ev.createdAt,
      ...(typeof p.replyToMessageId === "string"
        ? { replyToMessageId: p.replyToMessageId }
        : {}),
      ...(typeof p.replyQuote === "string" ? { replyQuote: p.replyQuote } : {}),
      ...("replyPreview" in p
        ? { replyPreview: (p.replyPreview as ThreadMessage["replyPreview"]) ?? null }
        : {}),
    };
    return mapThreadMessage(tm);
  }

  // Some deployments emit dedicated ask/choice events with a message-shaped payload.
  if (ev.type === "thread.ask" || ev.type === "thread.choice") {
    const p = ev.payload;
    const messageId =
      typeof p.messageId === "string"
        ? p.messageId
        : typeof p.id === "string"
          ? p.id
          : ev.id;
    const blocks = (Array.isArray(p.blocks) ? p.blocks : []) as MessageBlock[];
    if (blocks.length === 0 && ev.type === "thread.ask") {
      blocks.push({
        kind: "ask",
        text: typeof p.text === "string" ? p.text : typeof p.question === "string" ? p.question : "Approval needed",
        approvalEffectId:
          typeof p.approvalEffectId === "string"
            ? p.approvalEffectId
            : typeof p.approvalId === "string"
              ? p.approvalId
              : undefined,
        detail: typeof p.detail === "string" ? p.detail : undefined,
        site: typeof p.site === "string" ? p.site : undefined,
        status: p.status === "answered" ? "answered" : "pending",
        actions: Array.isArray(p.actions) ? (p.actions as { id: string; label: string }[]) : undefined,
        answer: typeof p.answer === "string" ? p.answer : undefined,
      });
    }
    if (blocks.length === 0 && ev.type === "thread.choice") {
      const options = Array.isArray(p.options)
        ? (p.options as { id: string; letter: string; label: string }[])
        : [];
      blocks.push({
        kind: "choice",
        question: typeof p.question === "string" ? p.question : "Choose an option",
        subtitle: typeof p.subtitle === "string" ? p.subtitle : undefined,
        options,
        answerId: typeof p.answerId === "string" ? p.answerId : undefined,
      });
    }
    if (blocks.length === 0) return null;
    const tm: ThreadMessage = {
      id: messageId,
      threadId: ev.threadId,
      seq: ev.seq,
      role: "bot",
      blocks,
      botId: ev.botId,
      runId: typeof p.runId === "string" ? p.runId : ev.runId,
      createdAt: ev.createdAt,
    };
    return mapThreadMessage(tm);
  }

  return null;
}

export function statusFromProductEvent(
  ev: ProductEvent,
): { botId: string; status: BotStatus } | null {
  const botId = ev.botId;
  if (!botId) return null;
  switch (ev.type) {
    case "run.started":
    case "thread.progress":
    case "agent.tool.called":
      return { botId, status: "thinking" };
    case "thread.meta": {
      const thinking = Boolean(
        (ev.payload as { activity?: { thinking?: boolean } }).activity?.thinking ??
          ev.payload.thinking,
      );
      return { botId, status: thinking ? "thinking" : "idle" };
    }
    case "run.waiting_input":
    case "thread.ask":
    case "thread.choice":
      return { botId, status: "waiting" };
    case "run.failed":
      return { botId, status: "blocked" };
    case "run.completed":
    case "run.cancelled":
    case "thread.message.finalized":
      return { botId, status: "idle" };
    default:
      return null;
  }
}

export function clientNonce(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `pica-${crypto.randomUUID()}`;
    }
  } catch {
    /* ignore */
  }
  return `pica-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
