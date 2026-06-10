import { readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { generateWorkstationQrPdf } from "@/lib/production/generate-workstation-qr-pdf";
import type { FactoryWorkstation } from "@/lib/production/factory-workstations";

const WORKSTATIONS_PATH = path.join(process.cwd(), "src/data/factory-workstations.json");

async function loadWorkstationsFile() {
  const raw = await readFile(WORKSTATIONS_PATH, "utf8");
  return JSON.parse(raw) as {
    updated_at: string;
    workstations: FactoryWorkstation[];
    [key: string]: unknown;
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("format") === "pdf") {
      const data = await loadWorkstationsFile();
      const pdfBytes = await generateWorkstationQrPdf(data.workstations);
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="workstation-qr-placards.pdf"',
          "Cache-Control": "no-store",
        },
      });
    }

    const data = await loadWorkstationsFile();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load workstations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Admin access required to save workstation positions." }, { status: 403 });
    }

    const body = (await request.json()) as {
      positions?: Array<{ id: string; x: number; y: number }>;
    };

    if (!body.positions?.length) {
      return NextResponse.json({ error: "positions array is required." }, { status: 400 });
    }

    const data = await loadWorkstationsFile();
    const byId = new Map(body.positions.map((p) => [p.id, p]));
    data.workstations = data.workstations.map((ws) => {
      const next = byId.get(ws.id);
      if (!next) return ws;
      return {
        ...ws,
        x: Math.min(98, Math.max(2, next.x)),
        y: Math.min(98, Math.max(2, next.y)),
      };
    });
    data.updated_at = new Date().toISOString();

    await writeFile(WORKSTATIONS_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");

    return NextResponse.json({ ok: true, updated_at: data.updated_at, workstations: data.workstations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save workstations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
