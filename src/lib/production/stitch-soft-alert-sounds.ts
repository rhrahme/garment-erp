/**
 * Overtime alert tones for the stitch kiosk (Web Audio, no asset files).
 * Preview on Live; later used when Cutting (etc.) sessions run long.
 */

export type StitchSoftAlertSoundId = "chime" | "wood" | "bell";

export const STITCH_SOFT_ALERT_SOUNDS: {
  id: StitchSoftAlertSoundId;
  label: string;
  hint: string;
}[] = [
  { id: "chime", label: "Strong chime", hint: "Two clear tones" },
  { id: "wood", label: "Strong tick", hint: "Short firm click" },
  { id: "bell", label: "Strong bell", hint: "One clear note" },
];

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  return new Ctx();
}

function tone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  durationSec: number,
  gainValue: number,
  type: OscillatorType = "sine"
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = frequency;
  const t0 = startAt;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(gainValue, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
  osc.start(t0);
  osc.stop(t0 + durationSec + 0.02);
}

/** Play a candidate overtime alert (user must click - browser audio policy). */
export async function playStitchSoftAlertSound(id: StitchSoftAlertSoundId): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    const t = ctx.currentTime;
    if (id === "chime") {
      // Louder two-tone; still cleaner than the error double-beep.
      tone(ctx, 700, t, 0.28, 0.14);
      tone(ctx, 940, t + 0.2, 0.34, 0.12);
      return;
    }
    if (id === "wood") {
      tone(ctx, 260, t, 0.09, 0.16, "triangle");
      tone(ctx, 180, t + 0.03, 0.08, 0.1, "square");
      return;
    }
    // bell - stronger fundamental + harmonic
    tone(ctx, 780, t, 0.55, 0.13);
    tone(ctx, 1040, t + 0.03, 0.42, 0.06);
    tone(ctx, 780, t + 0.12, 0.2, 0.05);
  } catch {
    /* ignore */
  }
}
