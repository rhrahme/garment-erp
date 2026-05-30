/**
 * Merge ClickUp MCP get_task (root + subtasks) payloads into clickup-import-cache.json.
 *
 * Usage:
 *   node scripts/merge-mcp-roots-into-cache.mjs path/to/task.json [more.json ...]
 *   node scripts/merge-mcp-roots-into-cache.mjs --agent-tools
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeTask } from "./build-clickup-import-cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CACHE_PATH = path.join(ROOT, "src/data/clickup-import-cache.json");
const AGENT_TOOLS_DIR = path.join(
  process.env.HOME,
  ".cursor/projects/Users-ralphrahme-Projects-garment-erp/agent-tools"
);

function flattenTaskTree(task, listOverride) {
  const out = [];
  const normalized = normalizeTask(task, listOverride ?? task.list);
  out.push(normalized);
  for (const subtask of task.subtasks ?? []) {
    out.push(...flattenTaskTree(subtask, subtask.list ?? normalized.list));
  }
  return out;
}

function mergeIntoCache(tasks) {
  const existing = fs.existsSync(CACHE_PATH)
    ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"))
    : [];
  const byId = new Map(existing.map((task) => [task.id, task]));

  for (const task of tasks) {
    const prev = byId.get(task.id);
    const prevFields = prev?.custom_fields?.length ?? 0;
    const nextFields = task.custom_fields?.length ?? 0;
    if (!prev || nextFields >= prevFields) {
      byId.set(task.id, task);
    }
  }

  const merged = [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return merged.length;
}

function loadRootPayload(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const task = JSON.parse(raw);
  if (!task?.id) throw new Error(`Not a task payload: ${filePath}`);
  return flattenTaskTree(task);
}

async function main() {
  const args = process.argv.slice(2);
  let files = args;

  if (args.includes("--agent-tools")) {
    const candidates = fs
      .readdirSync(AGENT_TOOLS_DIR)
      .filter((f) => f.endsWith(".txt"))
      .map((f) => path.join(AGENT_TOOLS_DIR, f))
      .map((filePath) => {
        try {
          const task = JSON.parse(fs.readFileSync(filePath, "utf8"));
          if (!task?.id) return null;
          const hasSubtasks = Boolean(task.subtasks?.length);
          const hasFields = Boolean(task.custom_fields?.length);
          if (!hasSubtasks && !hasFields) return null;
          const fieldCount = hasSubtasks
            ? (task.subtasks[0]?.custom_fields?.length ?? 0)
            : (task.custom_fields?.length ?? 0);
          return { filePath, rootId: task.id, fieldCount, hasSubtasks };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const bestByRoot = new Map();
    for (const entry of candidates) {
      const prev = bestByRoot.get(entry.rootId);
      if (!prev || entry.fieldCount > prev.fieldCount) {
        bestByRoot.set(entry.rootId, entry);
      }
    }
    files = [...bestByRoot.values()].map((entry) => entry.filePath);
  }

  if (!files.length) {
    console.error("Usage: merge-mcp-roots-into-cache.mjs [--agent-tools | file.json ...]");
    process.exit(1);
  }

  const allTasks = [];
  for (const filePath of files) {
    const tasks = loadRootPayload(filePath);
    console.log(`  ${path.basename(filePath)} → ${tasks.length} tasks (root ${tasks[0]?.name})`);
    allTasks.push(...tasks);
  }

  const total = mergeIntoCache(allTasks);
  console.log(`Cache now has ${total} tasks → ${CACHE_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
