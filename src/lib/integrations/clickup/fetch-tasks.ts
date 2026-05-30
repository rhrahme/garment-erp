import { CLICKUP_LIST_MAPPINGS } from "./list-stage-mapping";
import type { ClickUpTask } from "./types";

const HAGAN_SPACE_ID = "90184018803";

export const CLICKUP_IMPORT_LIST_IDS = CLICKUP_LIST_MAPPINGS.map((row) => row.list_id);

export interface FetchClickUpOptions {
  apiToken: string;
  listIds?: string[];
  includeClosed?: boolean;
}

async function clickUpGet<T>(apiToken: string, path: string): Promise<T> {
  const res = await fetch(`https://api.clickup.com/api/v2${path}`, {
    headers: { Authorization: apiToken, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp API ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchListTasks(
  apiToken: string,
  listId: string,
  includeClosed = false
): Promise<ClickUpTask[]> {
  const tasks: ClickUpTask[] = [];
  let page = 0;

  while (true) {
    const params = new URLSearchParams({
      archived: "false",
      include_closed: includeClosed ? "true" : "false",
      subtasks: "true",
      page: String(page),
    });
    const data = await clickUpGet<{ tasks: ClickUpTask[] }>(apiToken, `/list/${listId}/task?${params}`);
    if (!data.tasks?.length) break;
    tasks.push(...data.tasks);
    page += 1;
  }

  return tasks;
}

export async function fetchClickUpTasks(options: FetchClickUpOptions): Promise<ClickUpTask[]> {
  const listIds = options.listIds ?? CLICKUP_IMPORT_LIST_IDS;
  const byId = new Map<string, ClickUpTask>();

  for (const listId of listIds) {
    const tasks = await fetchListTasks(options.apiToken, listId, options.includeClosed ?? true);
    for (const task of tasks) {
      byId.set(task.id, task);
      for (const subtask of task.subtasks ?? []) {
        byId.set(subtask.id, subtask);
      }
    }
  }

  return hydrateClickUpTaskParents(options.apiToken, [...byId.values()]);
}

/** Fetch missing parent tasks so order roots (client names) resolve correctly. */
export async function hydrateClickUpTaskParents(
  apiToken: string,
  tasks: ClickUpTask[]
): Promise<ClickUpTask[]> {
  const byId = new Map<string, ClickUpTask>();
  for (const task of tasks) {
    byId.set(task.id, task);
    for (const subtask of task.subtasks ?? []) {
      byId.set(subtask.id, subtask);
    }
  }

  let pending = collectMissingParentIds([...byId.values()], byId);
  let fetched = 0;

  while (pending.length > 0) {
    const batch = pending.splice(0, 25);
    for (const parentId of batch) {
      if (byId.has(parentId)) continue;
      try {
        const parent = await fetchClickUpTaskDetails(apiToken, parentId);
        byId.set(parent.id, parent);
        for (const subtask of parent.subtasks ?? []) {
          byId.set(subtask.id, subtask);
        }
        fetched += 1;
      } catch (error) {
        console.warn(
          `Could not fetch ClickUp parent ${parentId}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
    pending = collectMissingParentIds([...byId.values()], byId);
  }

  if (fetched > 0) {
    console.log(`Fetched ${fetched} parent task(s) for order grouping`);
  }

  return [...byId.values()];
}

function collectMissingParentIds(tasks: ClickUpTask[], byId: Map<string, ClickUpTask>): string[] {
  const missing = new Set<string>();
  for (const task of tasks) {
    for (const parentId of [task.parent, task.top_level_parent]) {
      if (parentId && !byId.has(String(parentId))) {
        missing.add(String(parentId));
      }
    }
  }
  return [...missing];
}

export async function fetchClickUpTaskDetails(apiToken: string, taskId: string): Promise<ClickUpTask> {
  const params = new URLSearchParams({ include_subtasks: "true" });
  return clickUpGet<ClickUpTask>(apiToken, `/task/${taskId}?${params}`);
}

export { HAGAN_SPACE_ID };
