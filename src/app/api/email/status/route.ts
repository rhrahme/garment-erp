import { NextResponse } from "next/server";
import {
  getSmtpConfig,
  getSmtpMissingEnvVars,
  isSmtpConfigured,
  isVercelDeployment,
  verifySmtpConnection,
} from "@/lib/email/smtp";
import { getFactoryOrdersEmail } from "@/lib/data/supplier-catalogs";

export async function GET() {
  const config = getSmtpConfig();
  const factoryEmail = getFactoryOrdersEmail();
  const missing = getSmtpMissingEnvVars();

  return NextResponse.json({
    configured: isSmtpConfigured(),
    from: config?.from ?? factoryEmail,
    fromName: config?.fromName ?? "Hagan Fabric Orders",
    host: config?.host ?? null,
    port: config?.port ?? null,
    secure: config?.secure ?? false,
    factoryOrdersEmail: factoryEmail,
    missing,
    isProduction: isVercelDeployment(),
  });
}

export async function POST() {
  try {
    await verifySmtpConnection();
    return NextResponse.json({ ok: true, message: "SMTP connection verified." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMTP verification failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
