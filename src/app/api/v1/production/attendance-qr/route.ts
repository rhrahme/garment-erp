import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations";
import { generateAttendanceWallQrPdf } from "@/lib/production/generate-attendance-wall-qr-pdf";
import { ATTENDANCE_WALL_QR_PAYLOAD } from "@/lib/production/stitch-attendance";
import { contentDisposition } from "@/lib/pdf/download-filename";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const pdfBytes = await generateAttendanceWallQrPdf();
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition("attendance-wall-qr.pdf", "inline"),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to print attendance QR.";
    return NextResponse.json(
      { error: message, payload: ATTENDANCE_WALL_QR_PAYLOAD, source: "api" },
      { status: 500 }
    );
  }
}
