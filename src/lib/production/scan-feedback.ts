import type { ScanStation, StageScanNotice } from "@/lib/production/stage-scan";

export type ScanFeedbackTone = "success" | "warning" | "error" | "info";

export const SCAN_VOICE_FEEDBACK_KEY = "fabric-receiving:voice-feedback";

let audioContext: AudioContext | null = null;
let audioUnlockPromise: Promise<void> | null = null;
/** Scanner keypress starts a short window where voice is allowed after the API responds. */
let scanFeedbackActiveUntil = 0;

function beginScanFeedbackSession(): void {
  scanFeedbackActiveUntil = Date.now() + 12_000;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const Ctx =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioContext = new Ctx();
  }
  return audioContext;
}

function primeSpeechSynthesis(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.getVoices();
  const utterance = new SpeechSynthesisUtterance(" ");
  utterance.volume = 0;
  utterance.rate = 10;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/** Call on scanner keypress or tap — unlocks beeps + voice for the next few seconds. */
export function unlockScanAudio(): Promise<void> {
  beginScanFeedbackSession();
  primeSpeechSynthesis();

  if (audioUnlockPromise) return audioUnlockPromise;

  audioUnlockPromise = (async () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  })().catch(() => {
    audioUnlockPromise = null;
  });

  return audioUnlockPromise;
}

async function playTone(frequency: number, durationSec: number, delayMs = 0): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));

  try {
    await unlockScanAudio();
    const ctx = getAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.22;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime;
    oscillator.start(start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + durationSec);
    oscillator.stop(start + durationSec);
  } catch {
    // Visual feedback still shows.
  }
}

export async function playScanTone(tone: ScanFeedbackTone): Promise<void> {
  switch (tone) {
    case "success":
      await playTone(880, 0.1);
      await playTone(1175, 0.14);
      break;
    case "warning":
      await playTone(520, 0.18);
      await playTone(392, 0.22);
      await playTone(392, 0.22, 220);
      break;
    case "error":
      await playTone(220, 0.28);
      await playTone(185, 0.35, 280);
      break;
    case "info":
      await playTone(740, 0.12);
      break;
  }
}

export function readVoiceFeedbackEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SCAN_VOICE_FEEDBACK_KEY) !== "off";
}

export function writeVoiceFeedbackEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SCAN_VOICE_FEEDBACK_KEY, enabled ? "on" : "off");
}

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

export function scanFeedbackTone(notice?: StageScanNotice): ScanFeedbackTone {
  if (notice === "created") return "success";
  if (notice === "already_received") return "warning";
  if (notice === "advanced" || notice === "checked_in") return "info";
  return "info";
}

export function scanFeedbackHeadline(notice?: StageScanNotice): string | null {
  switch (notice) {
    case "created":
      return "Fabric received";
    case "already_received":
      return "Already received";
    case "advanced":
      return "Step updated";
    case "checked_in":
      return "Checked in";
    default:
      return null;
  }
}

export function scanFeedbackSpeechLine(input: {
  station?: ScanStation;
  notice?: StageScanNotice;
  article_number: number;
  fabric_cut_code: string;
  garment_type: string;
  fabric_number: string;
  message: string;
}): string {
  const art = formatArticle(input.article_number);

  switch (input.notice) {
    case "created":
      return `${art} received`;
    case "already_received":
      return `${art} already received`;
    case "advanced": {
      const msg = input.message.toLowerCase();
      const started = msg.includes("started");
      if (started) {
        if (input.station === "soak" || msg.includes("soak")) return `${art} soak started`;
        if (input.station === "iron" || msg.includes("ironing")) return `${art} iron started`;
        if (input.station === "wash" || msg.includes("wash")) return `${art} wash started`;
      }
      if (msg.includes("complete")) {
        if (input.station === "soak" || msg.includes("soak")) return `${art} soak done`;
        if (input.station === "iron" || msg.includes("ironing")) return `${art} iron done`;
        if (input.station === "wash" || msg.includes("wash")) return `${art} wash done`;
      }
      return `${art} updated`;
    }
    case "checked_in":
      return `${art} checked in`;
    default:
      return art;
  }
}

function shortErrorSpeech(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("not recognized")) return "Not recognized";
  if (lower.includes("timed out")) return "Timeout";
  if (lower.includes("not received yet")) return "Receive first";
  if (lower.includes("production")) return "In production";
  return "Scan failed";
}

export function speakScanFeedback(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  const voices = window.speechSynthesis.getVoices();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.15;
  utterance.pitch = 1;
  const english =
    voices.find((voice) => voice.lang.startsWith("en") && voice.localService) ??
    voices.find((voice) => voice.lang.startsWith("en"));
  if (english) utterance.voice = english;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export async function announceScanFeedback(input: {
  station?: ScanStation;
  notice?: StageScanNotice;
  article_number: number;
  fabric_cut_code: string;
  garment_type: string;
  fabric_number: string;
  message: string;
  voiceEnabled: boolean;
}): Promise<void> {
  const tone = scanFeedbackTone(input.notice);
  await playScanTone(tone);
  if (input.voiceEnabled) {
    speakScanFeedback(scanFeedbackSpeechLine(input));
  }
}

export async function announceScanError(message: string, voiceEnabled: boolean): Promise<void> {
  await playScanTone("error");
  if (voiceEnabled) {
    speakScanFeedback(shortErrorSpeech(message));
  }
}
