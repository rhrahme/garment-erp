import { NextResponse } from "next/server";
import {
  approveClientNameChange,
  buildClientNameChangeRequestSummary,
  rejectClientNameChange,
} from "@/lib/clients/name-change-requests";
import { verifyNameChangeEmailToken } from "@/lib/clients/name-change-email-token";
import { readClients } from "@/lib/data/clients";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export const dynamic = "force-dynamic";

/**
 * One-click approve/reject from the admin notification email. No login -
 * authorization comes from the signed token in the link (see
 * name-change-email-token.ts). Returns a small HTML page so the admin sees
 * the outcome in the browser tab the email opened.
 */

function page(title: string, detail: string, tone: "ok" | "warn" | "error"): NextResponse {
  const color = tone === "ok" ? "#047857" : tone === "warn" ? "#b45309" : "#b91c1c";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Garment ERP</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         background: #f8fafc; margin: 0; padding: 40px 16px; }
  .card { max-width: 460px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0;
          border-radius: 12px; padding: 28px 24px; }
  h1 { font-size: 18px; margin: 0 0 8px; color: ${color}; }
  p { font-size: 14px; color: #334155; margin: 0 0 6px; line-height: 1.5; }
  .muted { color: #94a3b8; font-size: 12px; margin-top: 16px; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${detail}</p>
    <p class="muted">Garment ERP - client name change requests</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const verified = verifyNameChangeEmailToken(token);
  if (!verified.ok) {
    if (verified.reason === "expired") {
      return page(
        "Link expired",
        "This approval link is older than 7 days. Open the ERP dashboard to handle the request.",
        "warn"
      );
    }
    return page("Invalid link", "This approval link is not valid.", "error");
  }

  const { client_id, action, requested_at, admin_email } = verified.payload;

  await ensureDocumentsLoaded(["clients", "sales_orders"]);
  const client = readClients().clients.find((row) => row.id === client_id);
  if (!client) {
    return page("Client not found", "This client no longer exists.", "error");
  }

  const pending = buildClientNameChangeRequestSummary(client);
  if (!pending) {
    return page(
      "Already handled",
      "This name change request was already approved, rejected, or cancelled. Nothing was changed.",
      "warn"
    );
  }
  if (pending.requested_at !== requested_at) {
    return page(
      "Request was updated",
      `The requester sent a newer proposal (${pending.proposed_name}) after this email. ` +
        "Use the latest email or the dashboard to act on it.",
      "warn"
    );
  }

  const actor = `${admin_email} (email link)`;
  if (action === "approve") {
    const result = await approveClientNameChange(client_id, actor);
    if (!result.ok) {
      return page("Could not approve", result.error, "error");
    }
    return page(
      "Name change approved",
      `${pending.current_name} (${pending.client_code}) is now ${pending.proposed_name}.`,
      "ok"
    );
  }

  const result = await rejectClientNameChange(client_id, actor);
  if (!result.ok) {
    return page("Could not reject", result.error, "error");
  }
  return page(
    "Name change rejected",
    `${pending.client_code} keeps the name ${pending.current_name}. ` +
      `The proposal (${pending.proposed_name}) was discarded.`,
    "ok"
  );
}
