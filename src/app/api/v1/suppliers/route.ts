import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { getAllSuppliersFromContacts } from "@/lib/data/supplier-contacts";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  const suppliers = getAllSuppliersFromContacts().map((supplier) => ({
    id: supplier.id,
    code: supplier.code,
    name: supplier.name,
    emails: supplier.emails ?? [],
    email: supplier.email,
    country: supplier.country,
    lead_time_days: supplier.lead_time_days,
  }));

  return NextResponse.json({ suppliers });
}
