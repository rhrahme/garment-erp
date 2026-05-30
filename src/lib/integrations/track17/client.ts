import { createHash } from "crypto";
import { TRACK17_API_BASE, getTrack17ApiKey } from "@/lib/integrations/track17/config";
import type {
  Track17ApiResponse,
  Track17RegisterResult,
  Track17TrackInfoResult,
} from "@/lib/integrations/track17/types";

async function track17Request<T>(path: string, body: unknown): Promise<Track17ApiResponse<T>> {
  const apiKey = getTrack17ApiKey();
  if (!apiKey) {
    throw new Error("17TRACK is not configured. Add TRACK17_API_KEY to .env.local.");
  }

  const response = await fetch(`${TRACK17_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "17token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as Track17ApiResponse<T>;
  if (!response.ok) {
    throw new Error(json.message ?? `17TRACK HTTP ${response.status}`);
  }

  return json;
}

export type RegisterTrackingInput = {
  number: string;
  carrier?: number;
  tag?: string;
};

export async function registerTrackings(inputs: RegisterTrackingInput[]) {
  if (inputs.length === 0) return { code: 0, data: { accepted: [], rejected: [] } };

  return track17Request<Track17RegisterResult>("/register", inputs);
}

export async function getTrackInfo(
  inputs: Array<{ number: string; carrier?: number }>
) {
  if (inputs.length === 0) return { code: 0, data: { accepted: [], rejected: [] } };

  return track17Request<Track17TrackInfoResult>("/gettrackinfo", inputs);
}

export function verifyTrack17WebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const apiKey = getTrack17ApiKey();
  if (!apiKey || !signatureHeader) return false;

  const expected = createHash("sha256").update(`${rawBody}/${apiKey}`, "utf8").digest("hex");

  return expected === signatureHeader.trim();
}
