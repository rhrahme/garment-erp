import { NextResponse } from "next/server";
import {
  approveClientNameChange,
  listPendingClientNameChangeRequests,
  rejectClientNameChange,
  requestClientNameChange,
} from "@/lib/clients/name-change-requests";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { verifyApiKey } from "@/lib/integrations/api-auth";

/** Zapier/API parity for client name-change requests. */
export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await ensureDocumentsLoaded(["clients"]);
  const requests = listPendingClientNameChangeRequests();
  return NextResponse.json({ requests, count: requests.length, source: "api" });
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as {
      action?: string;
      client_id?: string;
      actor?: string;
      title?: string | null;
      first_name?: string;
      middle_name?: string | null;
      last_name?: string;
    };
    const action = String(body.action ?? "").trim();
    const clientId = String(body.client_id ?? "").trim();
    const actor = String(body.actor ?? "").trim() || "api";
    if (!clientId) {
      return NextResponse.json({ error: "client_id is required." }, { status: 400 });
    }

    if (action === "request_change") {
      const result = await requestClientNameChange(clientId, actor, {
        title: body.title ?? null,
        first_name: String(body.first_name ?? ""),
        middle_name: body.middle_name ?? null,
        last_name: String(body.last_name ?? ""),
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ ok: true, request: result.summary, source: "api" });
    }

    if (action === "approve" || action === "reject") {
      const result =
        action === "approve"
          ? await approveClientNameChange(clientId, actor)
          : await rejectClientNameChange(clientId, actor);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ ok: true, client_id: result.client.id, source: "api" });
    }

    return NextResponse.json(
      { error: "Unsupported action. Use request_change, approve, or reject." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed client name-change request action (API):", error);
    return NextResponse.json({ error: "Failed to process name change request." }, { status: 500 });
  }
}
