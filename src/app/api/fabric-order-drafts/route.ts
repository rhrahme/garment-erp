import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  clearServerFabricOrderDraft,
  getServerFabricOrderDraft,
  saveServerFabricOrderDraft,
} from "@/lib/autosave/server-fabric-order-draft";
import { migrateSalesOrderDraft } from "@/lib/autosave/sales-order-draft";

export async function GET() {
  try {
    const session = await requireAuthenticated();
    if (!session?.email) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await ensureDocumentsLoaded(["fabric_order_drafts"]);
    const stored = await getServerFabricOrderDraft(session.email);
    if (!stored) {
      return NextResponse.json({ draft: null, saved_at: null });
    }

    return NextResponse.json({ draft: stored.draft, saved_at: stored.saved_at });
  } catch (error) {
    console.error("Failed to read fabric order draft:", error);
    return NextResponse.json({ error: "Failed to load server draft." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session?.email) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const draft = migrateSalesOrderDraft(body);
    if (!draft) {
      return NextResponse.json({ error: "Invalid draft payload." }, { status: 400 });
    }

    await ensureDocumentsLoaded(["fabric_order_drafts"]);
    const stored = await saveServerFabricOrderDraft(session.email, draft);
    return NextResponse.json({
      ok: true,
      saved_at: stored?.saved_at ?? null,
    });
  } catch (error) {
    console.error("Failed to save fabric order draft:", error);
    return NextResponse.json({ error: "Failed to save server draft." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await requireAuthenticated();
    if (!session?.email) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await ensureDocumentsLoaded(["fabric_order_drafts"]);
    await clearServerFabricOrderDraft(session.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to clear fabric order draft:", error);
    return NextResponse.json({ error: "Failed to clear server draft." }, { status: 500 });
  }
}
