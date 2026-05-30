export type { IntegrationEvent, IntegrationEventType } from "@/lib/types/integrations";
export { emitZapierEvent, getZapierWebhookUrl } from "./zapier";
export { verifyApiKey, getApiKey } from "./api-auth";
export { logIntegrationEvent, listIntegrationEvents } from "./event-log";

import { emitZapierEvent } from "./zapier";
import { logIntegrationEvent } from "./event-log";
import type { IntegrationEventType } from "@/lib/types/integrations";

/** Call after every meaningful ERP action — logs locally and sends to Zapier webhook. */
export async function notifyIntegration(
  event: IntegrationEventType,
  data: Record<string, unknown>,
  source: "erp" | "zapier" | "api" = "erp"
): Promise<void> {
  const payload = { ...data, _source: source };
  logIntegrationEvent(event, payload);
  await emitZapierEvent(event, payload);
}
