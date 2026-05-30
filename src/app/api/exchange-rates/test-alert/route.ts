import { NextResponse } from "next/server";
import { parseSuperAdminEmails } from "@/lib/auth/permissions";
import { EUR_SAR_ALERT_THRESHOLD, EUR_TO_SAR } from "@/lib/currency/config";
import { fetchMarketEurToSar } from "@/lib/currency/market-rate";
import { sendEmail } from "@/lib/email/smtp";

export async function POST() {
  const recipients = [...parseSuperAdminEmails()];
  if (recipients.length === 0) {
    return NextResponse.json({ error: "No SUPER_ADMIN_EMAILS configured." }, { status: 400 });
  }

  const snapshot = await fetchMarketEurToSar();
  const marketRate = snapshot.marketRate;
  const aboveThreshold =
    marketRate != null && marketRate > EUR_SAR_ALERT_THRESHOLD;

  try {
    const result = await sendEmail({
      to: recipients,
      subject: `[TEST] Garment ERP EUR/SAR rate check — ${marketRate?.toFixed(2) ?? "unavailable"}`,
      text: [
        "Garment ERP — TEST exchange rate alert",
        "",
        "This is a test email to confirm rate alerts are working.",
        "",
        `Live EUR → SAR: ${marketRate != null ? marketRate.toFixed(4) : "unavailable"}`,
        `Alert threshold: ${EUR_SAR_ALERT_THRESHOLD.toFixed(2)}`,
        `Book rate used for SAR prices: ${EUR_TO_SAR.toFixed(2)}`,
        `Above threshold: ${aboveThreshold ? "YES — real alerts would fire" : "NO — market is below threshold"}`,
        "",
        `Fetched at: ${snapshot.fetchedAt}`,
        `Source: ${snapshot.source ?? "n/a"}`,
        "",
        "When the live rate goes above the threshold, you will receive a real alert (max once per 24h).",
      ].join("\n"),
    });

    return NextResponse.json({
      ok: true,
      message: `Test rate alert sent to ${recipients.join(", ")}`,
      accepted: result.accepted,
      marketRate,
      aboveThreshold,
      alertThreshold: EUR_SAR_ALERT_THRESHOLD,
      bookRate: EUR_TO_SAR,
    });
  } catch (error) {
    console.error("Test rate alert email failed:", error);
    const message = error instanceof Error ? error.message : "Failed to send test email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
