"use client";

import { useState } from "react";
import {
  playStitchSoftAlertSound,
  STITCH_SOFT_ALERT_SOUNDS,
  type StitchSoftAlertSoundId,
} from "@/lib/production/stitch-soft-alert-sounds";

/** Temporary picker so floor can hear overtime soft-alert candidates. */
export function StitchSoftAlertSoundPreview() {
  const [playing, setPlaying] = useState<StitchSoftAlertSoundId | null>(null);

  async function play(id: StitchSoftAlertSoundId) {
    setPlaying(id);
    try {
      await playStitchSoftAlertSound(id);
    } finally {
      window.setTimeout(() => setPlaying(null), 600);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-sm font-semibold text-slate-900">Hear overtime soft sounds</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Click each one (browser needs a tap). We will pick one for Cutting overtime next.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {STITCH_SOFT_ALERT_SOUNDS.map((sound) => (
          <button
            key={sound.id}
            type="button"
            onClick={() => void play(sound.id)}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
          >
            {playing === sound.id ? "Playing..." : sound.label}
            <span className="mt-0.5 block text-xs font-normal text-slate-500">{sound.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
