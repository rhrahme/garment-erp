import { NextResponse } from "next/server";
import {
  ensureFabricOrdersLoaded,
  markStoredFabricOrderLinesSent,
  markStoredFabricOrdersSent,
} from "@/lib/integrations/fabric-order-store";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { notifyIntegration } from "@/lib/integrations";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureFabricOrdersLoaded();
    const body = (await request.json()) as {
      ids?: string[];
      emailed_at?: string;
      email_to?: string;
      lineIdsByPoId?: Record<string, string[]>;
    };

    const ids = (body.ids ?? []).filter(Boolean);
    const lineIdsByPoId = body.lineIdsByPoId ?? {};
    const hasLineSelection = Object.values(lineIdsByPoId).some((lineIds) => lineIds.length > 0);

    if (!hasLineSelection && ids.length === 0) {
      return NextResponse.json({ error: "At least one fabric order id is required." }, { status: 400 });
    }

    const emailedAt = body.emailed_at ?? new Date().toISOString();
    const emailTo = body.email_to?.trim() ?? "";

    const updated = hasLineSelection
      ? await markStoredFabricOrderLinesSent(lineIdsByPoId, {
          emailed_at: emailedAt,
          email_to: emailTo,
          status: "sent",
        })
      : await markStoredFabricOrdersSent(ids, {
          emailed_at: emailedAt,
          email_to: emailTo,
          status: "sent",
        });

    if (updated.length === 0) {
      return NextResponse.json({ error: "No matching fabric orders found." }, { status: 404 });
    }

    await Promise.all(
      updated.map((order) => {
        const selectedLineIds = lineIdsByPoId[order.id];
        const lineCount = selectedLineIds?.length ?? order.lines?.length ?? 0;
        return notifyIntegration("fabric_order.sent", {
          id: order.id,
          po_number: order.po_number,
          supplier_id: order.supplier_id,
          supplier_name: order.supplier?.name ?? null,
          email_to: emailTo,
          emailed_at: emailedAt,
          batch_size: updated.length,
          line_ids: selectedLineIds ?? null,
          lines_sent: lineCount,
          partial: selectedLineIds ? selectedLineIds.length < (order.lines?.length ?? 0) : false,
        });
      })
    );

    return NextResponse.json({ ok: true, orders: updated, count: updated.length });
  } catch (error) {
    console.error("Failed to mark fabric orders sent:", error);
    const message = error instanceof Error ? error.message : "Failed to mark fabric orders sent.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
