import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { generateAttendanceWallQrPdf } from "@/lib/production/generate-attendance-wall-qr-pdf";
import { ATTENDANCE_WALL_QR_PAYLOAD } from "@/lib/production/stitch-attendance";
import { contentDisposition } from "@/lib/pdf/download-filename";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

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
      { error: message, payload: ATTENDANCE_WALL_QR_PAYLOAD },
      { status: 500 }
    );
  }
}
