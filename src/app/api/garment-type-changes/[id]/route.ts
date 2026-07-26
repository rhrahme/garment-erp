import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { acknowledgeGarmentTypeChange } from "@/lib/sales-orders/acknowledge-garment-type-change";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { action?: string };
    if (body.action !== "acknowledge") {
      return NextResponse.json(
        { error: 'action must be "acknowledge".' },
        { status: 400 }
      );
    }

    const result = await acknowledgeGarmentTypeChange(id, session.email ?? "unknown");
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ change: result.change });
  } catch (error) {
    console.error("Failed to acknowledge garment type change:", error);
    return NextResponse.json({ error: "Failed to acknowledge change." }, { status: 500 });
  }
}
