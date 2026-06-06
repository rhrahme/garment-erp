import { readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";

const STATIONS_PATH = path.join(process.cwd(), "src/data/factory-floor-stations.json");

export async function GET() {
  try {
    const raw = await readFile(STATIONS_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load floor stations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Admin access required to save floor positions." }, { status: 403 });
    }

    const body = (await request.json()) as {
      positions?: Array<{ id: string; x: number; y: number }>;
    };

    if (!body.positions?.length) {
      return NextResponse.json({ error: "positions array is required." }, { status: 400 });
    }

    const raw = await readFile(STATIONS_PATH, "utf8");
    const data = JSON.parse(raw) as {
      updated_at: string;
      stations: Array<{ id: string; x: number; y: number; [key: string]: unknown }>;
      [key: string]: unknown;
    };

    const byId = new Map(body.positions.map((p) => [p.id, p]));
    data.stations = data.stations.map((station) => {
      const next = byId.get(station.id);
      if (!next) return station;
      return {
        ...station,
        x: Math.min(98, Math.max(2, next.x)),
        y: Math.min(98, Math.max(2, next.y)),
      };
    });
    data.updated_at = new Date().toISOString();

    await writeFile(STATIONS_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");

    return NextResponse.json({ ok: true, updated_at: data.updated_at, stations: data.stations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save floor stations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
