import { normalizeScannerInput } from "@/lib/production/scan-input";

/** Ignore the same QR held in frame. A new code (badge then wall) goes through immediately. */
export const CAMERA_SAME_CODE_COOLDOWN_MS = 1800;

export function cameraScanPayload(raw: string | null | undefined): string {
  return normalizeScannerInput(String(raw ?? ""));
}

export function shouldAcceptCameraDecode(input: {
  raw: string | null | undefined;
  lastAccepted: string | null | undefined;
  lastAcceptedAt: number;
  now: number;
  cooldownMs?: number;
}): boolean {
  const decoded = cameraScanPayload(input.raw);
  if (!decoded) return false;
  const previous = cameraScanPayload(input.lastAccepted);
  if (!previous || previous !== decoded) return true;
  const cooldown = input.cooldownMs ?? CAMERA_SAME_CODE_COOLDOWN_MS;
  return input.now - input.lastAcceptedAt >= cooldown;
}

export function isBrowserQrDetectorAvailable(): boolean {
  if (typeof globalThis === "undefined") return false;
  const Detector = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
  return typeof Detector === "function";
}
