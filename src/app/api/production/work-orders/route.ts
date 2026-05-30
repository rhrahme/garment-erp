import { NextResponse } from "next/server";
import { readProductionWorkOrders } from "@/lib/data/production-work-orders";

export async function GET() {
  try {
    return NextResponse.json(readProductionWorkOrders());
  } catch (error) {
    console.error("Failed to read production work orders:", error);
    return NextResponse.json({ error: "Failed to load production work orders." }, { status: 500 });
  }
}
