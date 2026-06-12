import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readClients } from "@/lib/data/clients";
import {
  clearServerFabricOrderDraft,
  getServerFabricOrderDraft,
  listFabricOrderDraftSummaries,
  saveServerFabricOrderDraft,
  summarizeFabricOrderDraft,
} from "@/lib/autosave/server-fabric-order-draft";
import { migrateSalesOrderDraft } from "@/lib/autosave/sales-order-draft";

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session?.email) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const url = new URL(request.url);
    const adminSummary = url.searchParams.get("admin_summary") === "1";

    await ensureDocumentsLoaded(["fabric_order_drafts", "clients"]);

    if (adminSummary) {
      if (!session.isAdmin) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      const drafts = await listFabricOrderDraftSummaries(readClients().clients);
      return NextResponse.json({ drafts, count: drafts.length });
    }

    const stored = await getServerFabricOrderDraft(session.email);
    if (!stored) {
      return NextResponse.json({ draft: null, saved_at: null, summary: null });
    }

    const summary = summarizeFabricOrderDraft(stored.draft, readClients().clients);
    return NextResponse.json({
      draft: stored.draft,
      saved_at: stored.saved_at,
      summary,
    });
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
