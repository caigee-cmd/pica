import type { Message } from "@/types/gateway";

/** Chronological ascending: prefer seq when both have it; else created_at; id tie-break. */
export function compareMessagesChronological(a: Message, b: Message): number {
  const aSeq = typeof a.seq === "number" ? a.seq : null;
  const bSeq = typeof b.seq === "number" ? b.seq : null;
  if (aSeq != null && bSeq != null) {
    const bySeq = aSeq - bSeq;
    if (bySeq !== 0) return bySeq;
  }
  const byTime = a.created_at - b.created_at;
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortMessagesChronological(messages: Message[]): Message[] {
  return messages.slice().sort(compareMessagesChronological);
}

/**
 * Rakazo `threads.messages` pages with `before` / `olderCursor` — page may arrive
 * newest-first. Normalize to oldest→newest for the chat transcript.
 */
export function ensureOldestFirst(messages: Message[]): Message[] {
  if (messages.length < 2) return sortMessagesChronological(messages);
  const first = messages[0]?.seq;
  const last = messages[messages.length - 1]?.seq;
  const maybeReversed =
    typeof first === "number" && typeof last === "number" && first > last
      ? messages.slice().reverse()
      : messages;
  return sortMessagesChronological(maybeReversed);
}
