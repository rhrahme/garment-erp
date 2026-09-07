export type { IntegrationEvent, IntegrationEventType } from "@/lib/types/integrations";
export { emitZapierEvent, getZapierWebhookUrl } from "./zapier";
export { verifyApiKey, getApiKey } from "./api-auth";
export { logIntegrationEvent, listIntegrationEvents } from "./event-log";

import { emitZapierEvent } from "./zapier";
import { logIntegrationEvent } from "./event-log";
import { activityTeamFromSession, formatActivityActor } from "@/lib/activity/team";
import { recordActivityEvent } from "@/lib/data/activity-events";
import { getSessionContext } from "@/lib/auth/session";
import type { IntegrationEventType } from "@/lib/types/integrations";

async function actorFromCurrentSession(): Promise<{
  email: string | null;
  name: string;
  team: ReturnType<typeof activityTeamFromSession>;
} | null> {
  try {
    const session = await getSessionContext();
    if (!session.email) return null;
    const actor = formatActivityActor(session.email);
    return {
      email: actor.email,
      name: actor.name,
      team: activityTeamFromSession(session),
    };
  } catch {
    return null;
  }
}

/** Call after every meaningful ERP action - logs locally and sends to Zapier webhook. */
export async function notifyIntegration(
  event: IntegrationEventType,
  data: Record<string, unknown>,
  source: "erp" | "zapier" | "api" = "erp"
): Promise<void> {
  const sessionActor = await actorFromCurrentSession();
  const payload = {
    ...data,
    _source: source,
    ...(sessionActor
      ? { _actor: sessionActor.email, _actor_name: sessionActor.name, _team: sessionActor.team }
      : {}),
  };
  await Promise.all([
    logIntegrationEvent(event, payload),
    emitZapierEvent(event, payload),
    recordActivityEvent({
      action: event,
      data: payload,
      actorEmail: sessionActor?.email ?? (typeof data.acted_by === "string" ? data.acted_by : null),
      actorName: sessionActor?.name,
      team: sessionActor?.team,
    }),
  ]);
}
