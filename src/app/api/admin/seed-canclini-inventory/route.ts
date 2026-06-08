import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createAdminClient, seedCancliniInventory } from "@/lib/data/seed-canclini-inventory";

export async function POST(request: Request) {
  const session = await requireSuperAdmin();
  if (!session) {
    return NextResponse.json({ error: "Super admin access required." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured on server." },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  try {
    const result = await seedCancliniInventory(admin, { force });
    if (!result.ok && result.reason?.includes("Missing warehouse tables")) {
      return NextResponse.json({ error: result.reason }, { status: 503 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Canclini inventory seed failed:", error);
    const message = error instanceof Error ? error.message : "Seed failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
