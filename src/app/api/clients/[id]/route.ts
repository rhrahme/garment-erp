import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { deleteClientById } from "@/lib/data/clients";
import { notifyIntegration } from "@/lib/integrations";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Only admins can delete clients." }, { status: 403 });
    }

    const { id } = await context.params;
    // deleteClientById enforces the linked-sales-order guard (fresh SO read).
    const result = await deleteClientById(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 404 });
    }

    await notifyIntegration("client.deleted", {
      client_id: result.client.id,
      client_code: result.client.code,
      deleted_by: session.email,
    });

    return NextResponse.json({ ok: true, client_id: result.client.id });
  } catch (error) {
    console.error("Failed to delete client:", error);
    return NextResponse.json({ error: "Failed to delete client." }, { status: 500 });
  }
}
