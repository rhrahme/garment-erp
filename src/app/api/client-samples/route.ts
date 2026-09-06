import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { getClientById } from "@/lib/data/clients";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { canAccessClient } from "@/lib/sales/access";
import { addReadyMadeSample, listReadyMadeSamples } from "@/lib/clients/ready-made-samples";

/**
 * Client ready-made samples (garments the client hands us as reference).
 * Every team can record samples - access is any authenticated session; the
 * receiving employee is identified by their ID badge scan, not the account.
 *
 * GET ?client_id=... lists that client's samples (including returned).
 * GET without client_id lists outstanding samples across clients the
 * session can see (Samples view on /clients).
 */
export async function GET(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["clients"]);

  const params = new URL(request.url).searchParams;
  const clientId = params.get("client_id")?.trim() ?? "";
  if (!clientId) {
    const outstandingOnly = params.get("outstanding") !== "0";
    const rows = listReadyMadeSamples({ outstandingOnly }).filter((row) =>
      canAccessClient(session, { brand_ids: row.brand_ids })
    );
    return NextResponse.json({ samples: rows, rows });
  }

  const client = getClientById(clientId);
  if (!client || !canAccessClient(session, client)) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
  return NextResponse.json({ samples: client.ready_made_samples ?? [] });
}

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["clients"]);

  let body: {
    client_id?: string;
    product_type?: string;
    purpose?: string;
    intent?: string;
    brand?: string;
    color?: string;
    size?: string;
    notes?: string;
    received_by_badge?: string;
    photo_count?: number;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const client = getClientById(String(body.client_id ?? "").trim());
  if (!client || !canAccessClient(session, client)) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const result = await addReadyMadeSample({
    client_id: client.id,
    product_type: body.product_type,
    purpose: body.purpose,
    intent: body.intent,
    brand: body.brand,
    color: body.color,
    size: body.size,
    notes: body.notes,
    received_by_badge: body.received_by_badge,
    photo_count: body.photo_count,
    added_by: session.email,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ sample: result.sample }, { status: 201 });
}
