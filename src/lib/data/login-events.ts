import path from "path";
import { loginRequestMeta } from "@/lib/auth/login-request-meta";
import { readJsonFileFreshAsync, saveDocument } from "@/lib/data/document-persistence";
import { notifyIntegration } from "@/lib/integrations";
import type { LoginEvent, LoginEventMethod, LoginEventsFile } from "@/lib/types/login-events";

const STORE_PATH = path.join(process.cwd(), "src/data/login-events.json");
const EMPTY: LoginEventsFile = { updated_at: null, events: [] };
const MAX_EVENTS = 800;

export async function readLoginEventsFresh(): Promise<LoginEventsFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true });
}

export async function listLoginEvents(limit = 200): Promise<LoginEvent[]> {
  const store = await readLoginEventsFresh();
  return (store.events ?? []).slice(0, limit);
}

export async function recordLoginEvent(input: {
  outcome: LoginEvent["outcome"];
  method: LoginEventMethod;
  actor: string;
  identifier: string;
  ip: string;
  device: string;
  user_agent: string;
  error?: string | null;
}): Promise<LoginEvent | null> {
  try {
    const event: LoginEvent = {
      id: `login-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      outcome: input.outcome,
      method: input.method,
      actor: input.actor.trim() || input.identifier.trim() || "unknown",
      identifier: input.identifier.trim(),
      ip: input.ip.trim() || "unknown",
      device: input.device.trim() || "Unknown device",
      user_agent: input.user_agent.slice(0, 400),
      error: input.error?.trim() || null,
    };
    const store = structuredClone(await readLoginEventsFresh());
    store.events = [event, ...(store.events ?? [])].slice(0, MAX_EVENTS);
    store.updated_at = event.at;
    await saveDocument(STORE_PATH, store);
    void notifyIntegration(
      input.outcome === "success" ? "auth.login" : "auth.login_failed",
      {
        id: event.id,
        actor: event.actor,
        identifier: event.identifier,
        method: event.method,
        ip: event.ip,
        device: event.device,
        at: event.at,
        error: event.error,
      }
    ).catch((error) => {
      console.error("[login-events] notifyIntegration failed:", error);
    });
    return event;
  } catch (error) {
    console.error("[login-events] record failed:", error);
    return null;
  }
}

export function recordLoginFromRequest(
  request: Request,
  input: {
    outcome: LoginEvent["outcome"];
    method: LoginEventMethod;
    actor: string;
    identifier: string;
    error?: string | null;
  }
): void {
  const meta = loginRequestMeta(request);
  void recordLoginEvent({ ...meta, ...input });
}
