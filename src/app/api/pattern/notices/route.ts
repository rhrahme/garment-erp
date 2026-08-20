import { NextResponse } from "next/server";
import { requireAuthenticated, sessionActor } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  listOpenPatternOperatorNotices,
  listPatternOperatorNotices,
} from "@/lib/data/pattern-operator-notices";
import {
  ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID,
} from "@/lib/pattern/pattern-operator-notice-copy";
import {
  createPatternOperatorNotice,
  ensureAllPatternHowToNotices,
  recordPatternNoticeSeen,
} from "@/lib/pattern/pattern-operator-notice-actions";

export async function GET(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!session.isAdmin && !session.isPatternOperator) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await ensureDocumentsLoaded(["pattern_operator_notices"]);
  try {
    await ensureAllPatternHowToNotices(session.email ?? "system");
  } catch (error) {
    console.error("Failed to ensure Pattern how-to notices:", error);
  }

  if (session.isPatternOperator) {
    try {
      await recordPatternNoticeSeen(
        ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID,
        sessionActor(session)
      );
    } catch (error) {
      console.error("Failed to record Pattern how-to seen:", error);
    }
  }

  const status = new URL(request.url).searchParams.get("status")?.trim().toLowerCase();
  const notices =
    status === "all"
      ? listPatternOperatorNotices(undefined, 100)
      : listOpenPatternOperatorNotices(50);
  return NextResponse.json({ notices });
}

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await ensureDocumentsLoaded(["pattern_operator_notices"]);
  try {
    const body = (await request.json()) as {
      id?: string;
      title?: string;
      body?: string;
      href?: string | null;
      href_label?: string | null;
      email?: boolean;
      force_email?: boolean;
    };
    if (!body.title?.trim() || !body.body?.trim()) {
      return NextResponse.json({ error: "title and body are required." }, { status: 400 });
    }
    const result = await createPatternOperatorNotice({
      id: body.id,
      title: body.title,
      body: body.body,
      href: body.href,
      href_label: body.href_label,
      created_by: session.email ?? "admin",
      email: body.email !== false,
      forceEmail: body.force_email === true,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to create Pattern operator notice:", error);
    return NextResponse.json({ error: "Failed to create notice." }, { status: 500 });
  }
}
