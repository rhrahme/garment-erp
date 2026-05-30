import type { IntegrationEvent, IntegrationEventType } from "@/lib/types/integrations";

export function getZapierWebhookUrl(): string | null {
  return process.env.ZAPIER_WEBHOOK_URL?.trim() || null;
}

export async function emitZapierEvent<T extends Record<string, unknown>>(
  event: IntegrationEventType,
  data: T
): Promise<void> {
  const url = getZapierWebhookUrl();
  if (!url) return;

  const payload: IntegrationEvent<T> = {
    event,
    timestamp: new Date().toISOString(),
    source: (data._source as IntegrationEvent["source"]) ?? "erp",
    data,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error("Zapier webhook HTTP error:", event, response.status, await response.text());
    }
  } catch (error) {
    console.error("Zapier webhook failed:", event, error);
  }
}
