export function getTrack17ApiKey(): string | null {
  return process.env.TRACK17_API_KEY?.trim() || null;
}

export function isTrack17Configured(): boolean {
  return Boolean(getTrack17ApiKey());
}

export const TRACK17_API_BASE = "https://api.17track.net/track/v2.4";
