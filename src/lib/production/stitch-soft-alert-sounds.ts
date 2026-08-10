/**
 * Soft overtime alert tones for the stitch kiosk (Web Audio, no asset files).
 * Preview on Live; later used when Cutting (etc.) sessions run long.
 */

export type StitchSoftAlertSoundId = "chime" | "wood" | "bell";

export const STITCH_SOFT_ALERT_SOUNDS: {
  id: StitchSoftAlertSoundId;
  label: string;
  hint: string;
}[] = [
  { id: "chime", label: "Soft chime", hint: "Two gentle tones" },
  { id: "wood", label: "Wood tick", hint: "Quiet short click" },
  { id: "bell", label: "Soft bell", hint: "One calm note" },
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
  gain.gain.exponentialRampToValueAtTime(gainValue, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
  osc.start(t0);
  osc.stop(t0 + durationSec + 0.02);
}

/** Play a candidate soft overtime alert (user must click - browser audio policy). */
export async function playStitchSoftAlertSound(id: StitchSoftAlertSoundId): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    const t = ctx.currentTime;
    if (id === "chime") {
      tone(ctx, 660, t, 0.22, 0.035);
      tone(ctx, 880, t + 0.18, 0.28, 0.03);
      return;
    }
    if (id === "wood") {
      tone(ctx, 220, t, 0.06, 0.04, "triangle");
      tone(ctx, 140, t + 0.02, 0.05, 0.025, "triangle");
      return;
    }
    // bell
    tone(ctx, 740, t, 0.45, 0.032);
    tone(ctx, 980, t + 0.02, 0.35, 0.012);
  } catch {
    /* ignore */
  }
}
