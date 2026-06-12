import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  clearServerFabricOrderDraft,
  getServerFabricOrderDraft,
  saveServerFabricOrderDraft,
} from "@/lib/autosave/server-fabric-order-draft";
import { migrateSalesOrderDraft } from "@/lib/autosave/sales-order-draft";
import { verifyApiKey } from "@/lib/integrations/api-auth";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const userEmail = url.searchParams.get("user_email")?.trim();
  if (!userEmail) {
    return NextResponse.json({ error: "user_email query param is required." }, { status: 400 });
  }

  await ensureDocumentsLoaded(["fabric_order_drafts"]);
  const stored = await getServerFabricOrderDraft(userEmail);
  if (!stored) {
    return NextResponse.json({ draft: null, saved_at: null });
  }

  return NextResponse.json({ draft: stored.draft, saved_at: stored.saved_at });
}

export async function PUT(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as { user_email?: string; draft?: unknown };
    const userEmail = body.user_email?.trim();
    if (!userEmail) {
      return NextResponse.json({ error: "user_email is required." }, { status: 400 });
    }

    const draft = migrateSalesOrderDraft(body.draft);
    if (!draft) {
      return NextResponse.json({ error: "Invalid draft payload." }, { status: 400 });
    }

    await ensureDocumentsLoaded(["fabric_order_drafts"]);
    const stored = await saveServerFabricOrderDraft(userEmail, draft);
    return NextResponse.json({ ok: true, saved_at: stored?.saved_at ?? null });
  } catch (error) {
    console.error("API v1 fabric order draft save failed:", error);
    return NextResponse.json({ error: "Failed to save server draft." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const userEmail = url.searchParams.get("user_email")?.trim();
  if (!userEmail) {
    return NextResponse.json({ error: "user_email query param is required." }, { status: 400 });
  }

  await ensureDocumentsLoaded(["fabric_order_drafts"]);
  await clearServerFabricOrderDraft(userEmail);
  return NextResponse.json({ ok: true });
}
