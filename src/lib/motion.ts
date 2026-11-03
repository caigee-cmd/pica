import gsap from "gsap";

export const MOTION_ROUND = 12 as const;

/** BoardUI-ish snappy timings (seconds). Reduced-motion callers still no-op travel. */
export const MOTION_TIMING = {
  arc: 0.48,
  arcStagger: 0.06,
  arcLift: 0.24,
  arcLand: 0.16,
  arcSquash: 0.1,
  spring: 0.32,
  morph: 0.36,
  fade: 0.12,
  pulse: 0.7,
  wanderBase: 2.1,
  /** Round 12 — BoardUI agent-composer + message blur enter */
  sendTap: 0.28,
  composerFocus: 0.16,
  composerSend: 0.22,
  railSelect: 0.18,
  threadSwitch: 0.2,
  msgEnter: 0.42,
  chip: 0.2,
  highlight: 0.55,
  editorRail: 0.28,
} as const;


export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function motionReady(): boolean {
  return !prefersReducedMotion();
}

type WanderHandle = { kill: () => void };

/**
 * Soft idle wander on avatar wrappers. Call once per mounted alive avatar.
 * No-ops when the user prefers reduced motion.
 */
export function wanderAvatar(el: HTMLElement | null, seed = 0): WanderHandle {
  if (!el || prefersReducedMotion()) return { kill: () => undefined };
  const amp = 1.35 + (seed % 5) * 0.2;
  const dur = MOTION_TIMING.wanderBase + (seed % 7) * 0.14;
  const tween = gsap.to(el, {
    x: amp,
    y: -amp * 0.6,
    duration: dur,
    yoyo: true,
    repeat: -1,
    ease: "sine.inOut",
    delay: (seed % 10) * 0.07,
  });
  return {
    kill: () => {
      tween.kill();
      gsap.set(el, { clearProps: "transform" });
    },
  };
}

export type ArcSpec = {
  botId: string;
  fromEl: HTMLElement;
  toEl: HTMLElement;
};

let flyingLayer: HTMLElement | null = null;

function ensureFlyingLayer(): HTMLElement {
  if (flyingLayer && document.body.contains(flyingLayer)) return flyingLayer;
  const layer = document.createElement("div");
  layer.className = "pica-fly-layer";
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "60",
    overflow: "visible",
  });
  document.body.appendChild(layer);
  flyingLayer = layer;
  return layer;
}

/**
 * Staggered arcs from header cluster avatars into Thinking row slots,
 * ending with a squash. Clones fly; sources fade briefly.
 * Returns a cleanup that kills in-flight tweens.
 */
export function arcIntoThinking(specs: ArcSpec[], onAllDone?: () => void): () => void {
  if (specs.length === 0) {
    onAllDone?.();
    return () => undefined;
  }
  if (prefersReducedMotion()) {
    onAllDone?.();
    return () => undefined;
  }

  const layer = ensureFlyingLayer();
  const clones: HTMLElement[] = [];
  const tweens: gsap.core.Tween[] = [];
  let remaining = specs.length;

  specs.forEach((spec, index) => {
    const from = spec.fromEl.getBoundingClientRect();
    const to = spec.toEl.getBoundingClientRect();
    const clone = spec.fromEl.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-avatar-source");
    clone.classList.add("pica-fly-clone");
    Object.assign(clone.style, {
      position: "fixed",
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      margin: "0",
      zIndex: String(70 + index),
      transformOrigin: "50% 50%",
      willChange: "transform",
    });
    layer.appendChild(clone);
    clones.push(clone);

    gsap.set(spec.fromEl, { opacity: 0.25 });
    gsap.set(spec.toEl, { opacity: 0 });

    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const lift = Math.min(72, Math.abs(dy) * 0.35 + 36);
    const midX = dx * 0.45 + (index % 2 === 0 ? -18 : 18);
    const midY = dy * 0.35 - lift;

    const tween = gsap.to(clone, {
      duration: MOTION_TIMING.arc,
      delay: index * MOTION_TIMING.arcStagger,
      ease: "power2.inOut",
      keyframes: [
        {
          x: midX,
          y: midY,
          scale: 1.06,
          duration: MOTION_TIMING.arcLift,
          ease: "power1.out",
        },
        {
          x: dx,
          y: dy,
          scaleX: 1.16,
          scaleY: 0.82,
          duration: MOTION_TIMING.arcLand,
          ease: "power2.in",
        },
        {
          scaleX: 1,
          scaleY: 1,
          duration: MOTION_TIMING.arcSquash,
          ease: "back.out(2.2)",
        },
      ],
      onComplete: () => {
        gsap.set(spec.toEl, { opacity: 1 });
        gsap.set(spec.fromEl, { opacity: 1 });
        clone.remove();
        remaining -= 1;
        if (remaining <= 0) onAllDone?.();
      },
    });
    tweens.push(tween);
  });

  return () => {
    for (const t of tweens) t.kill();
    for (const c of clones) c.remove();
    for (const spec of specs) {
      gsap.set(spec.fromEl, { clearProps: "opacity" });
      gsap.set(spec.toEl, { clearProps: "opacity" });
    }
  };
}

/** Soft pulse on the Thinking row label while agents are busy. */
export function pulseThinkingLabel(el: HTMLElement | null): WanderHandle {
  if (!el || prefersReducedMotion()) return { kill: () => undefined };
  const tween = gsap.to(el, {
    opacity: 0.45,
    duration: MOTION_TIMING.pulse,
    yoyo: true,
    repeat: -1,
    ease: "sine.inOut",
  });
  return {
    kill: () => {
      tween.kill();
      gsap.set(el, { clearProps: "opacity" });
    },
  };
}

/** Soft pop when AgentEditor color / emotion changes. */
export function springSoft(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(
    el,
    { scale: 0.92 },
    { scale: 1, duration: MOTION_TIMING.spring, ease: "back.out(2.4)", overwrite: "auto" },
  );
}

/** Soft squash when avatar shape / color morphs. Skips travel when reduced-motion. */
export function morphSquash(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(
    el,
    { scaleX: 1.12, scaleY: 0.82 },
    {
      scaleX: 1,
      scaleY: 1,
      duration: MOTION_TIMING.morph,
      ease: "elastic.out(1, 0.62)",
      overwrite: "auto",
    },
  );
}

/** Quick opacity fade for search expand / hover chrome. Instant when reduced-motion. */
export function fadeQuick(
  el: HTMLElement | null,
  opts: { from?: number; to?: number; duration?: number } = {},
): void {
  if (!el) return;
  const from = opts.from ?? 0;
  const to = opts.to ?? 1;
  if (prefersReducedMotion()) {
    gsap.set(el, { opacity: to });
    return;
  }
  gsap.fromTo(
    el,
    { opacity: from },
    { opacity: to, duration: opts.duration ?? MOTION_TIMING.fade, ease: "power2.out", overwrite: "auto" },
  );
}


/** BoardUI agent-chat line enter: soft blur + lift; multi-agent keeps side bias. */
export function enterMessageRow(
  el: HTMLElement | null,
  opts: { mine?: boolean; delay?: number } = {},
): void {
  if (!el) return;
  if (prefersReducedMotion()) {
    gsap.set(el, { clearProps: "opacity,transform,filter" });
    return;
  }
  const x = opts.mine ? 10 : -8;
  gsap.fromTo(
    el,
    { opacity: 0, y: 4, x, filter: "blur(5px)", scale: 0.992 },
    {
      opacity: 1,
      y: 0,
      x: 0,
      filter: "blur(0px)",
      scale: 1,
      duration: MOTION_TIMING.msgEnter,
      delay: opts.delay ?? 0,
      // BoardUI LINE_TRANSITION ease ≈ cubic-bezier(0.22, 0.61, 0.36, 1)
      ease: "power2.out",
      overwrite: "auto",
      clearProps: "opacity,transform,filter",
    },
  );
}

/** Send button press — squash then spring (BoardUI blue pill). */
export function tapSend(el: HTMLElement | null): void {
  if (!el) return;
  if (prefersReducedMotion()) return;
  gsap.fromTo(
    el,
    { scale: 1 },
    {
      keyframes: [
        { scale: 0.86, duration: 0.08, ease: "power2.in" },
        { scale: 1.06, duration: 0.12, ease: "power2.out" },
        { scale: 1, duration: 0.12, ease: "back.out(2.4)" },
      ],
      overwrite: "auto",
    },
  );
}

/** Composer shell focus / blur feedback. */
export function composerFocusPulse(el: HTMLElement | null, focused: boolean): void {
  if (!el) return;
  if (prefersReducedMotion()) {
    el.classList.toggle("is-focused", focused);
    gsap.set(el, { clearProps: "transform" });
    return;
  }
  el.classList.toggle("is-focused", focused);
  gsap.to(el, {
    scale: focused ? 1.008 : 1,
    duration: MOTION_TIMING.composerFocus,
    ease: focused ? "power2.out" : "power2.inOut",
    overwrite: "auto",
    transformOrigin: "50% 100%",
  });
}

/** Soft bar squash when a message actually leaves the composer. */
export function composerSendPulse(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(
    el,
    { scaleY: 1, scaleX: 1 },
    {
      keyframes: [
        { scaleY: 0.97, scaleX: 1.01, duration: 0.08, ease: "power2.in" },
        { scaleY: 1, scaleX: 1, duration: MOTION_TIMING.composerSend, ease: "back.out(1.8)" },
      ],
      overwrite: "auto",
      transformOrigin: "50% 100%",
    },
  );
}

/** Sidebar row select settle — Lulu/HuLa quiet settle, no bounce pop. */
export function selectRailItem(el: HTMLElement | null): void {
  if (!el) return;
  if (prefersReducedMotion()) {
    gsap.set(el, { clearProps: "transform" });
    return;
  }
  gsap.fromTo(
    el,
    { scale: 0.992 },
    {
      scale: 1,
      duration: MOTION_TIMING.railSelect,
      ease: "power2.out",
      overwrite: "auto",
      clearProps: "transform",
    },
  );
}

/** Press feedback — native client press, not cartoon bounce. */
export function tapRailItem(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(
    el,
    { scale: 1 },
    {
      keyframes: [
        { scale: 0.97, duration: 0.05, ease: "power2.in" },
        { scale: 1, duration: 0.14, ease: "power2.out" },
      ],
      overwrite: "auto",
      clearProps: "transform",
    },
  );
}

/** Thread pane cross-fade when switching chats. */
export function enterThreadSwitch(el: HTMLElement | null): void {
  if (!el) return;
  if (prefersReducedMotion()) {
    gsap.set(el, { clearProps: "opacity,transform" });
    return;
  }
  gsap.fromTo(
    el,
    { opacity: 0.35, y: 6 },
    {
      opacity: 1,
      y: 0,
      duration: MOTION_TIMING.threadSwitch,
      ease: "power2.out",
      overwrite: "auto",
      clearProps: "opacity,transform",
    },
  );
}

/** Attachment / reply chip entrance. */
export function enterChip(el: HTMLElement | null): void {
  if (!el) return;
  if (prefersReducedMotion()) {
    gsap.set(el, { clearProps: "opacity,transform" });
    return;
  }
  gsap.fromTo(
    el,
    { opacity: 0, y: 6, scale: 0.92 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: MOTION_TIMING.chip,
      ease: "back.out(1.8)",
      overwrite: "auto",
      clearProps: "opacity,transform",
    },
  );
}

/** Jump-to-reply flash ring (accent pulse). */
export function flashHighlight(el: HTMLElement | null): void {
  if (!el) return;
  if (prefersReducedMotion()) {
    el.classList.add("pica-flash-hit");
    window.setTimeout(() => el.classList.remove("pica-flash-hit"), 900);
    return;
  }
  el.classList.add("pica-flash-hit");
  gsap.fromTo(
    el,
    { scale: 1 },
    {
      keyframes: [
        { scale: 1.015, duration: 0.14, ease: "power2.out" },
        { scale: 1, duration: MOTION_TIMING.highlight, ease: "power2.inOut" },
      ],
      overwrite: "auto",
      onComplete: () => el.classList.remove("pica-flash-hit"),
    },
  );
}

/** Soft ready-state pop when send becomes enabled. */
export function sendReadyPop(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(
    el,
    { scale: 0.9 },
    {
      scale: 1,
      duration: 0.24,
      ease: "back.out(2.6)",
      overwrite: "auto",
    },
  );
}

/** Status / ask / choice card pop — matches Rakazo rounded card feel. */
export function enterStatusCard(el: HTMLElement | null): void {
  if (!el) return;
  if (prefersReducedMotion()) {
    gsap.set(el, { clearProps: "opacity,transform" });
    return;
  }
  gsap.fromTo(
    el,
    { opacity: 0, y: 8, scale: 0.985 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.22,
      ease: "power2.out",
      overwrite: "auto",
      clearProps: "opacity,transform",
    },
  );
}


/** Right-rail AgentEditor entrance (slide + fade from the right). */
export function enterEditorRail(el: HTMLElement | null): void {
  if (!el) return;
  if (prefersReducedMotion()) {
    gsap.set(el, { clearProps: "opacity,transform" });
    return;
  }
  gsap.fromTo(
    el,
    { opacity: 0, x: 18 },
    {
      opacity: 1,
      x: 0,
      duration: 0.28,
      ease: "power2.out",
      overwrite: "auto",
      clearProps: "opacity,transform",
    },
  );
}

/**
 * Desktop right rail collapse/expand — GSAP width tween (~60fps layout).
 * Keeps overflow clipped; sync `--editor-w` via onUpdate. Reduced-motion → snap.
 */
export function animateEditorRail(
  el: HTMLElement | null,
  opts: {
    open: boolean;
    width: number;
    onUpdate?: (widthPx: number) => void;
    onComplete?: () => void;
  },
): gsap.core.Tween | null {
  if (!el) return null;
  const target = opts.open ? Math.max(0, opts.width) : 0;
  if (prefersReducedMotion()) {
    gsap.killTweensOf(el);
    gsap.set(el, { width: target });
    opts.onUpdate?.(target);
    opts.onComplete?.();
    return null;
  }
  return gsap.to(el, {
    width: target,
    duration: MOTION_TIMING.editorRail,
    ease: "power3.inOut",
    overwrite: "auto",
    // width drives flex layout; avoid transform-only so chat column reflows smoothly
    onUpdate: () => {
      opts.onUpdate?.(Number.parseFloat(String(gsap.getProperty(el, "width"))) || el.offsetWidth);
    },
    onComplete: () => opts.onComplete?.(),
  });
}

/** Modal panel entrance (dialogs) — soft pop over scrim. */
export function enterDialogPanel(el: HTMLElement | null): void {
  if (!el) return;
  if (prefersReducedMotion()) {
    gsap.set(el, { clearProps: "opacity,transform" });
    return;
  }
  gsap.fromTo(
    el,
    { opacity: 0, y: 12, scale: 0.97 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.2,
      ease: "power2.out",
      overwrite: "auto",
      clearProps: "opacity,transform",
    },
  );
}
