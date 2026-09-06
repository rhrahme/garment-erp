import { NextResponse } from "next/server";
import { ensurePatternLibraryLoaded } from "@/lib/data/pattern-library";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  copyBasePatternToBrand,
  copyBrandBasesToBrand,
} from "@/lib/pattern-library/mutations";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const body = (await request.json().catch(() => null)) as {
      source_base_id?: string;
      source_brand_id?: string;
      house_brand_id?: string;
      force?: boolean;
      actor?: string;
    } | null;

    const targetBrandId = body?.house_brand_id?.trim() ?? "";
    if (!targetBrandId) {
      return NextResponse.json({ error: "house_brand_id is required." }, { status: 400 });
    }

    const actor = typeof body?.actor === "string" && body.actor.trim() ? body.actor.trim() : "api";
    const sourceBaseId = body?.source_base_id?.trim() ?? "";
    if (sourceBaseId) {
      const result = await copyBasePatternToBrand(sourceBaseId, targetBrandId, {
        createdBy: actor,
        force: Boolean(body?.force),
        notify: true,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        skipped: result.skipped,
        base: result.base,
        existing: result.skipped ? result.existing : null,
        files_copied: result.skipped ? 0 : result.files_copied,
        source: "api",
      });
    }

    const sourceBrandId = body?.source_brand_id?.trim() ?? "";
    if (!sourceBrandId) {
      return NextResponse.json(
        { error: "source_base_id or source_brand_id is required." },
        { status: 400 }
      );
    }

    const result = await copyBrandBasesToBrand(sourceBrandId, targetBrandId, {
      createdBy: actor,
      force: Boolean(body?.force),
      notify: true,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      created: result.created,
      skipped: result.skipped,
      created_count: result.created.length,
      skipped_count: result.skipped.length,
      source: "api",
    });
  } catch (error) {
    console.error("Failed to copy base pattern to brand (API):", error);
    return NextResponse.json({ error: "Failed to copy base pattern." }, { status: 500 });
  }
}
