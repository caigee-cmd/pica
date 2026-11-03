import { useEffect, useRef } from "react";
import { SHAPE_PATHS, type ShapeId } from "@/lib/avatarShapes";
import { morphSquash, wanderAvatar } from "@/lib/motion";
import { cn, colorFor, initials } from "@/lib/utils";
import { usePrefs, type EmotionId } from "@/stores/prefs";

/**
 * Bot avatar with SVG silhouette + optional blink/wander.
 * Shape + color morph via soft squash (respects prefers-reduced-motion).
 */
export function Avatar({
  id,
  name,
  emoji,
  size = 32,
  alive = false,
  color,
  emotion,
  shape,
  className,
  "data-bot-id": dataBotId,
  "data-avatar-source": dataAvatarSource,
  "data-avatar-slot": dataAvatarSlot,
}: {
  id: string;
  name: string;
  emoji?: string;
  size?: number;
  alive?: boolean;
  color?: string;
  emotion?: EmotionId;
  shape?: ShapeId;
  className?: string;
  "data-bot-id"?: string;
  "data-avatar-source"?: string;
  "data-avatar-slot"?: string;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLSpanElement>(null);
  const look = usePrefs((s) => s.agents[id]);
  const fill = color ?? look?.color ?? colorFor(id);
  const face: EmotionId = emotion ?? look?.emotion ?? "neutral";
  const silhouette: ShapeId = shape ?? look?.shape ?? "circle";
  const showEyes = alive && size >= 22;
  const seed = hashSeed(id);
  const lastMorph = useRef("");

  useEffect(() => {
    if (!alive) return;
    return wanderAvatar(root.current, seed).kill;
  }, [alive, seed]);

  useEffect(() => {
    const key = `${silhouette}:${fill}`;
    if (!lastMorph.current) {
      lastMorph.current = key;
      return;
    }
    if (key === lastMorph.current) return;
    lastMorph.current = key;
    morphSquash(body.current);
  }, [silhouette, fill]);

  const eye = Math.max(2, Math.round(size * 0.12));
  const eyeTop =
    size *
    (face === "sleepy" ? 0.42 : face === "happy" ? 0.36 : face === "focused" ? 0.34 : 0.38);
  const eyeGap = size * (face === "focused" ? 0.14 : 0.18);
  const eyeH =
    face === "sleepy"
      ? Math.max(1.5, eye * 0.45)
      : face === "happy"
        ? Math.max(1.5, eye * 0.55)
        : face === "focused"
          ? eye * 1.15
          : eye;
  const browW = Math.max(4, size * 0.22);
  const browH = Math.max(1.5, size * 0.045);
  const path = SHAPE_PATHS[silhouette];
  const round = silhouette === "circle";

  return (
    <span
      ref={root}
      data-bot-id={dataBotId ?? id}
      data-avatar-source={dataAvatarSource}
      data-avatar-slot={dataAvatarSlot}
      data-emotion={face}
      data-shape={silhouette}
      className={cn(
        "pica-avatar relative inline-flex shrink-0 items-center justify-center overflow-visible font-medium text-white",
        alive && "pica-avatar-alive",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      <span
        ref={body}
        className={cn(
          "absolute inset-0 overflow-hidden",
          round && "rounded-full",
        )}
        style={round ? { background: fill } : undefined}
      >
        {!round ? (
          <svg
            viewBox="0 0 100 100"
            className="absolute inset-0 size-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <path d={path} fill={fill} />
          </svg>
        ) : null}
        <span className="relative z-[1] flex size-full items-center justify-center leading-none">
          {emoji?.trim() || initials(name)}
        </span>
      </span>
      {showEyes ? (
        <span className="pointer-events-none absolute inset-0 z-[2]" aria-hidden>
          {face === "angry" || face === "focused" ? (
            <>
              <span
                className="absolute rounded-full bg-zinc-950/90"
                style={{
                  width: browW,
                  height: browH,
                  top: eyeTop - size * (face === "focused" ? 0.14 : 0.12),
                  left: `calc(50% - ${eyeGap}px - ${browW / 2}px)`,
                  transform: face === "focused" ? "rotate(0deg)" : "rotate(18deg)",
                }}
              />
              <span
                className="absolute rounded-full bg-zinc-950/90"
                style={{
                  width: browW,
                  height: browH,
                  top: eyeTop - size * (face === "focused" ? 0.14 : 0.12),
                  left: `calc(50% + ${eyeGap}px - ${browW / 2}px)`,
                  transform: face === "focused" ? "rotate(0deg)" : "rotate(-18deg)",
                }}
              />
            </>
          ) : null}
          <span
            className={cn(
              "pica-eye absolute rounded-full bg-zinc-900/85 dark:bg-zinc-950",
              face === "sleepy" && "pica-eye-sleepy",
              face === "happy" && "pica-eye-happy",
            )}
            style={{
              width: eye,
              height: eyeH,
              top: eyeTop,
              left: `calc(50% - ${eyeGap}px - ${eye / 2}px)`,
              animationDelay: `${(seed % 9) * 0.35}s`,
              borderRadius: face === "happy" ? "50% 50% 40% 40%" : undefined,
            }}
          />
          <span
            className={cn(
              "pica-eye absolute rounded-full bg-zinc-900/85 dark:bg-zinc-950",
              face === "sleepy" && "pica-eye-sleepy",
              face === "happy" && "pica-eye-happy",
            )}
            style={{
              width: eye,
              height: eyeH,
              top: eyeTop,
              left: `calc(50% + ${eyeGap}px - ${eye / 2}px)`,
              animationDelay: `${(seed % 9) * 0.35 + 0.05}s`,
              borderRadius: face === "happy" ? "50% 50% 40% 40%" : undefined,
            }}
          />
          {face === "sleepy" ? (
            <>
              <span
                className="absolute rounded-full bg-white/35"
                style={{
                  width: eye * 1.15,
                  height: Math.max(1, eye * 0.35),
                  top: eyeTop - eye * 0.15,
                  left: `calc(50% - ${eyeGap}px - ${(eye * 1.15) / 2}px)`,
                }}
              />
              <span
                className="absolute rounded-full bg-white/35"
                style={{
                  width: eye * 1.15,
                  height: Math.max(1, eye * 0.35),
                  top: eyeTop - eye * 0.15,
                  left: `calc(50% + ${eyeGap}px - ${(eye * 1.15) / 2}px)`,
                }}
              />
            </>
          ) : null}
          {face === "happy" ? (
            <span
              className="absolute rounded-full border-b-2 border-zinc-900/70"
              style={{
                width: size * 0.28,
                height: size * 0.14,
                top: size * 0.58,
                left: `calc(50% - ${size * 0.14}px)`,
                borderTop: "none",
                background: "transparent",
              }}
            />
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}
