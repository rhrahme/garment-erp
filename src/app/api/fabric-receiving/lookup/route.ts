import { NextResponse } from "next/server";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { lookupFabricLabel } from "@/lib/production/fabric-label-lookup";

export async function POST(request: Request) {
  try {
    await ensureFabricReceivingDocumentsLoaded();
    const body = (await request.json()) as { code?: string };
    const code = String(body.code ?? "").trim();

    if (!code) {
      return NextResponse.json({ error: "Enter or paste a fabric label code." }, { status: 400 });
    }

    const result = lookupFabricLabel(code);
    if (!result) {
      return NextResponse.json(
        { error: "Label not recognized — check the client code and line number on the sticker." },
        { status: 404 }
      );
    }

    return NextResponse.json({ lookup: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lookup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
