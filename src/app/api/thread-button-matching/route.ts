import { NextResponse } from "next/server";
import { requireAuthenticated, type SessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import {
  listThreadButtonMatches,
  parseThreadButtonMatchComponent,
  parseThreadButtonMatchStatus,
  updateThreadButtonMatch,
} from "@/lib/production/thread-button-matching";
import type { ThreadButtonMatchListFilter } from "@/lib/types/thread-button-matching";

const LIST_FILTERS = new Set<ThreadButtonMatchListFilter>([
  "needs_matching",
  "needs_attention",
  "missing",
  "decision_needed",
  "done",
  "all",
]);

function canAccessMatching(session: SessionContext): boolean {
  return Boolean(session.userId || session.email);
}

function canUpdateMatching(session: SessionContext): boolean {
  return (
    session.isAdmin ||
    session.isClientManager ||
    session.isTaskOperator ||
    session.isProductionOperator
  );
}

async function ensureMatchingDocsLoaded(): Promise<void> {
  await ensureFabricReceivingDocumentsLoaded();
  await ensureDocumentsLoaded(["thread_button_matches"]);
}

export async function GET(request: Request) {
  const session = await requireAuthenticated();
  if (!session || !canAccessMatching(session)) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    await ensureMatchingDocsLoaded();
    const url = new URL(request.url);
    const filterParam = url.searchParams.get("filter") ?? "needs_matching";
    const filter = LIST_FILTERS.has(filterParam as ThreadButtonMatchListFilter)
      ? (filterParam as ThreadButtonMatchListFilter)
      : "needs_matching";
    const result = await listThreadButtonMatches({ filter });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list matches.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!canUpdateMatching(session)) {
    return NextResponse.json({ error: "Not allowed to update thread/button matches." }, { status: 403 });
  }

  try {
    await ensureMatchingDocsLoaded();
    const body = (await request.json()) as {
      sales_order_line_id?: string;
      component?: string;
      status?: string;
      note?: string | null;
    };

    const component = parseThreadButtonMatchComponent(body.component);
    const status = parseThreadButtonMatchStatus(body.status);
    if (!component) {
      return NextResponse.json(
        { error: 'component must be "thread" or "button".' },
        { status: 400 }
      );
    }
    if (!status || status === "pending") {
      return NextResponse.json(
        {
          error:
            'status must be "confirmed", "missing", or "decision_needed".',
        },
        { status: 400 }
      );
    }

    const match = await updateThreadButtonMatch({
      sales_order_line_id: String(body.sales_order_line_id ?? "").trim(),
      component,
      status,
      note: body.note,
      actor: session.email ?? session.userId ?? "unknown",
      source: "erp",
    });

    return NextResponse.json({ match });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update match.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
