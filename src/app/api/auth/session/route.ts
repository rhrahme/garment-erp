import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await getSessionContext();
    return NextResponse.json({
      email: session.email,
      role: session.role,
      is_super_admin: session.isSuperAdmin,
    });
  } catch (error) {
    console.error("Failed to read session:", error);
    return NextResponse.json({ error: "Failed to load session." }, { status: 500 });
  }
}
