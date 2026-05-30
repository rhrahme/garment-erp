import { getDropdown, getText } from "./field-parsers";
import type { ClickUpTask } from "./types";

/** Task represents a garment line (has Item and/or Fabric Number filled). */
export function isClickUpLineTask(task: ClickUpTask): boolean {
  const item = getDropdown(task.custom_fields, "Item");
  const fabric = getText(task.custom_fields, "Fabric Number");
  return Boolean(item || fabric);
}

export function indexClickUpTasks(tasks: ClickUpTask[]): Map<string, ClickUpTask> {
  const byId = new Map<string, ClickUpTask>();
  for (const task of tasks) {
    byId.set(task.id, task);
    for (const subtask of task.subtasks ?? []) {
      byId.set(subtask.id, subtask);
    }
  }
  return byId;
}

/** Walk parent chain to the order root (client or group order task). */
export function findClickUpOrderRootId(task: ClickUpTask, byId: Map<string, ClickUpTask>): string {
  const visited = new Set<string>();
  let current: ClickUpTask | undefined = task;

  while (current) {
    if (!current.parent) return current.id;
    if (visited.has(current.id)) break;
    visited.add(current.id);

    const parent = byId.get(String(current.parent));
    if (!parent) {
      return String(current.top_level_parent ?? current.parent ?? current.id);
    }
    current = parent;
  }

  return String(task.top_level_parent ?? task.parent ?? task.id);
}

export function collectMissingParentIds(tasks: ClickUpTask[], byId: Map<string, ClickUpTask>): string[] {
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

export function groupLineTasksByOrderRoot(
  tasks: ClickUpTask[],
  byId: Map<string, ClickUpTask>
): Map<string, ClickUpTask[]> {
  const groups = new Map<string, ClickUpTask[]>();

  for (const task of tasks) {
    if (!isClickUpLineTask(task)) continue;
    const rootId = findClickUpOrderRootId(task, byId);
    const bucket = groups.get(rootId) ?? [];
    bucket.push(task);
    groups.set(rootId, bucket);
  }

  return groups;
}
