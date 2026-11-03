import { useEffect, useRef, useState } from "react";
import { MarkdownView } from "@/components/MarkdownView";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Reveals an already-complete gateway message as if it were streaming.
 * BoardUI-ish: first short beat lands quickly, then the rest streams.
 * Gateway emits whole messages over WS — not token deltas.
 */
export function Typewriter({
  text,
  active,
  onDone,
  highlightMentions,
}: {
  text: string;
  active: boolean;
  onDone?: () => void;
  highlightMentions?: boolean;
}) {
  const reduced = prefersReducedMotion();
  const [count, setCount] = useState(active && !reduced ? 0 : text.length);
  const doneRef = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    doneRef.current = false;
    started.current = false;
    if (!active || reduced) {
      setCount(text.length);
      return;
    }
    setCount(0);
  }, [text, active, reduced]);

  useEffect(() => {
    if (!active || reduced) {
      if (!active) setCount(text.length);
      return;
    }
    if (started.current) return;
    started.current = true;

    // Beat 1: land the first short line / clause quickly (BoardUI feel).
    const firstBreak = firstBeatLength(text);
    setCount(Math.min(firstBreak, text.length));

    const rest = Math.max(0, text.length - firstBreak);
    // ~40–90 chars/sec depending on length; cap so long reports don't crawl forever.
    const cps = rest > 400 ? 120 : rest > 120 ? 95 : 72;
    const step = Math.max(1, Math.ceil(cps / 60));
    const timer = window.setInterval(() => {
      setCount((current) => {
        if (current >= text.length) {
          window.clearInterval(timer);
          return text.length;
        }
        // After the opening beat, stream the remainder.
        const base = Math.max(current, firstBreak);
        return Math.min(text.length, base + step);
      });
    }, 16);

    return () => window.clearInterval(timer);
  }, [active, text, reduced]);

  useEffect(() => {
    if (!active) return;
    if (count < text.length) return;
    if (doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  }, [active, count, text.length, onDone]);

  const shown = text.slice(0, count);
  const typing = active && count < text.length && !reduced;
  return <MarkdownView text={shown} typing={typing} highlightMentions={highlightMentions} />;
}

/** Prefer end of first sentence / line / ~42 chars for the opening beat. */
function firstBeatLength(text: string): number {
  if (text.length <= 24) return text.length;
  const window = text.slice(0, 56);
  const sentence = window.search(/[.!?…](\s|$)/);
  if (sentence >= 12) return sentence + 1;
  const line = window.indexOf("\n");
  if (line >= 8) return line;
  const space = window.lastIndexOf(" ", 42);
  if (space >= 16) return space;
  return Math.min(36, text.length);
}
