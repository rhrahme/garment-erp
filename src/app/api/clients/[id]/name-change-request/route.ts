import { NextResponse } from "next/server";
import { redactClientContact } from "@/lib/auth/client-contact-access";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  approveClientNameChange,
  isClientNameChangePending,
  rejectClientNameChange,
  requestClientNameChange,
} from "@/lib/clients/name-change-requests";
import { readClients } from "@/lib/data/clients";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import type { ClientProfile } from "@/lib/types/clients";

/**
 * Client name-change requests (rename is admin-gated):
 * - request_change: QC/non-admin proposes a new name; admins get an email +
 *   a dashboard approval card. Re-requesting overwrites the pending proposal.
 * - cancel_request: requester (or admin) drops their own pending proposal.
 * - approve: admin applies the proposed name.
 * - reject: admin keeps the current name.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      first_name?: string;
      middle_name?: string | null;
      last_name?: string;
    };
    const action = String(body.action ?? "").trim();
    const actor = session.email ?? "unknown";
    const safeClient = (client: ClientProfile) =>
      session.canViewClientContact ? client : redactClientContact(client);

    if (action === "request_change") {
      if (session.isAdmin) {
        return NextResponse.json(
          { error: "Admins can rename clients directly on the Clients page." },
          { status: 400 }
        );
      }
      const result = await requestClientNameChange(id, actor, {
        first_name: String(body.first_name ?? ""),
        middle_name: body.middle_name ?? null,
        last_name: String(body.last_name ?? ""),
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ client: safeClient(result.client), request: result.summary });
    }

    if (action === "cancel_request") {
      await ensureDocumentsLoaded(["clients"]);
      const client = readClients().clients.find((entry) => entry.id === id);
      if (!client) {
        return NextResponse.json({ error: "Client not found." }, { status: 404 });
      }
      if (!isClientNameChangePending(client)) {
        return NextResponse.json({ client: safeClient(client) });
      }
      if (
        !session.isAdmin &&
        client.name_change_requested_by?.trim().toLowerCase() !== actor.trim().toLowerCase()
      ) {
        return NextResponse.json(
          { error: "You can only cancel your own name change request." },
          { status: 403 }
        );
      }
      const result = await rejectClientNameChange(id, actor, { asCancel: true });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ client: safeClient(result.client) });
    }

    if (action === "approve" || action === "reject") {
      if (!session.isAdmin) {
        return NextResponse.json(
          { error: "Only admins can approve or reject name change requests." },
          { status: 403 }
        );
      }
      const result =
        action === "approve"
          ? await approveClientNameChange(id, actor)
          : await rejectClientNameChange(id, actor);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ client: safeClient(result.client) });
    }

    return NextResponse.json(
      { error: "Unsupported action. Use request_change, cancel_request, approve, or reject." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed client name-change request action:", error);
    return NextResponse.json({ error: "Failed to process name change request." }, { status: 500 });
  }
}
