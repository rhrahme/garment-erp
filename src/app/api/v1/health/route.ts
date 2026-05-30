import { NextResponse } from "next/server";
import { getApiKey } from "@/lib/integrations/api-auth";
import { getZapierWebhookUrl } from "@/lib/integrations/zapier";
import { isSmtpConfigured } from "@/lib/email/smtp";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "garment-erp",
    version: "1",
    integrations: {
      zapier_webhook: Boolean(getZapierWebhookUrl()),
      api_key: Boolean(getApiKey()),
      smtp: isSmtpConfigured(),
    },
  });
}
