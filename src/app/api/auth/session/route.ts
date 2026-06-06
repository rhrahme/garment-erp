import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FABRIC_PRICE_UNLOCK_COOKIE, hasFabricPriceAccess } from "@/lib/auth/fabric-price-access";
import { getSessionContext } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await getSessionContext();
    const cookieStore = await cookies();
    const canViewFabricPrices = hasFabricPriceAccess(
      session,
      cookieStore.get(FABRIC_PRICE_UNLOCK_COOKIE)?.value
    );
    return NextResponse.json({
      email: session.email,
      role: session.role,
      is_super_admin: session.isSuperAdmin,
      is_admin: session.isAdmin,
      is_client_manager: session.isClientManager,
      can_view_client_contact: session.canViewClientContact,
      can_view_fabric_list_prices: session.canViewFabricListPrices,
      can_view_fabric_prices: canViewFabricPrices,
    });
  } catch (error) {
    console.error("Failed to read session:", error);
    return NextResponse.json({ error: "Failed to load session." }, { status: 500 });
  }
}
