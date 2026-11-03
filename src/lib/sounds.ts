import { usePrefs } from "@/stores/prefs";

/** Soft notification chime via Web Audio (no asset file). */
export function playNotifySound(): void {
  try {
    const { soundEnabled, soundVolume } = usePrefs.getState();
    if (!soundEnabled) return;
    const vol = Math.min(1, Math.max(0, soundVolume));
    if (vol <= 0) return;

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.22 * vol, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    master.connect(ctx.destination);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(880, now);
    o1.frequency.exponentialRampToValueAtTime(660, now + 0.18);
    o1.connect(master);
    o1.start(now);
    o1.stop(now + 0.3);

    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(1320, now + 0.05);
    o2.connect(master);
    o2.start(now + 0.05);
    o2.stop(now + 0.28);

    void ctx.resume().catch(() => undefined);
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 500);
  } catch {
    /* autoplay / AudioContext blocked */
  }
}
