import { NextResponse } from "next/server";
import { applyClickUpImport } from "@/lib/integrations/clickup/import-orders";
import { fetchClickUpTasks } from "@/lib/integrations/clickup/fetch-tasks";
import type { ClickUpTask } from "@/lib/integrations/clickup/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      reset?: boolean;
      tasks?: ClickUpTask[];
      fetch?: boolean;
    };

    let tasks = body.tasks;
    if (!tasks?.length && body.fetch !== false) {
      const token = process.env.CLICKUP_API_TOKEN?.trim();
      if (!token) {
        return NextResponse.json(
          { error: "CLICKUP_API_TOKEN not configured. Pass tasks[] in body or set token in .env.local." },
          { status: 400 }
        );
      }
      tasks = await fetchClickUpTasks({ apiToken: token });
    }

    if (!tasks?.length) {
      return NextResponse.json({ error: "No ClickUp tasks to import." }, { status: 400 });
    }

    const result = applyClickUpImport(tasks, { reset: body.reset ?? true });
    return NextResponse.json({ ok: true, imported: result, task_count: tasks.length });
  } catch (error) {
    console.error("ClickUp import failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 500 }
    );
  }
}
