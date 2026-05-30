import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/session";
import { deleteClientById } from "@/lib/data/clients";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { notifyIntegration } from "@/lib/integrations";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSuperAdmin();
    if (!session) {
      return NextResponse.json({ error: "Super admin access required." }, { status: 403 });
    }

    const { id } = await context.params;
    const linkedOrders = readSalesOrders().orders.filter((order) => order.client_id === id);
    if (linkedOrders.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete client with ${linkedOrders.length} linked sales order(s). Remove or reassign orders first.`,
        },
        { status: 409 }
      );
    }

    const result = deleteClientById(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
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
