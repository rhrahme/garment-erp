import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  FABRIC_PRICE_UNLOCK_COOKIE,
  canRevealFabricPrices,
  canViewFabricStock,
  hasFabricPriceAccess,
} from "@/lib/auth/fabric-price-access";
import { getSessionContext } from "@/lib/auth/session";
import { getAllowedSalesBrandIds } from "@/lib/sales/access";

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
      is_task_operator: session.isTaskOperator,
      is_production_operator: session.isProductionOperator,
      is_pattern_operator: session.isPatternOperator,
      is_sales_operator: session.isSalesOperator,
      can_view_client_contact: session.canViewClientContact,
      can_view_fabric_list_prices: session.canViewFabricListPrices,
      can_reveal_fabric_prices: canRevealFabricPrices(session),
      can_view_fabric_prices: canViewFabricPrices,
      can_view_fabric_stock: canViewFabricStock(session),
      can_access_pattern: session.canAccessPattern,
      allowed_sales_brand_ids: getAllowedSalesBrandIds(session),
    });
  } catch (error) {
    console.error("Failed to read session:", error);
    return NextResponse.json({ error: "Failed to load session." }, { status: 500 });
  }
}
