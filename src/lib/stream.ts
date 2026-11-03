import {
  closeThreadSubscribe,
  openThreadSubscribe,
} from "@/lib/transport";
import type {
  GatewayConfig,
  ProductEvent,
  ThreadTarget,
} from "@/types/gateway";

export type StreamStatus = "connecting" | "live" | "reconnecting" | "closed" | "error";

type Handlers = {
  onEvent: (event: ProductEvent) => void;
  onStatus: (status: StreamStatus, detail?: string) => void;
};

function isProductEvent(raw: unknown): raw is ProductEvent {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return typeof o.type === "string" && typeof o.threadId === "string" && typeof o.seq === "number";
}

/**
 * Per-thread live stream via Rakazo `threads.subscribe` (SSE / eventIterator).
 * No global `/ws`.
 */
export function subscribeThread(
  config: GatewayConfig,
  target: ThreadTarget,
  cursor: number,
  handlers: Handlers,
): () => void {
  let closed = false;
  let stop: (() => void) | null = null;
  const latestCursor = Number.isFinite(cursor) ? cursor : -1;
  handlers.onStatus("connecting");

  const input = target.botId
    ? { botId: target.botId, cursor: latestCursor }
    : { groupId: target.groupId!, cursor: latestCursor };

  void openThreadSubscribe(
    config,
    input,
    (raw) => {
      if (closed) return;
      if (!isProductEvent(raw)) return;
      handlers.onEvent(raw);
    },
    (state, detail) => {
      if (closed) return;
      if (state === "live") handlers.onStatus("live", detail);
      else if (state === "connecting") handlers.onStatus("connecting", detail);
      else if (state === "error") handlers.onStatus("reconnecting", detail);
      else handlers.onStatus("closed", detail);
    },
  )
    .then((unlisten) => {
      if (closed) unlisten();
      else stop = unlisten;
    })
    .catch((err: unknown) => {
      if (!closed) {
        handlers.onStatus(
          "reconnecting",
          err instanceof Error ? err.message : "subscribe failed",
        );
      }
    });

  return () => {
    closed = true;
    stop?.();
    void closeThreadSubscribe();
    handlers.onStatus("closed");
  };
}

/** Split an SSE buffer into events. Returns the unparsed tail. */
export function takeSseEvents(buffer: string): { events: string[]; rest: string } {
  const chunks = buffer.split("\n\n");
  const rest = chunks.pop() ?? "";
  const events = chunks
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n"),
    )
    .filter(Boolean);
  return { events, rest };
}
