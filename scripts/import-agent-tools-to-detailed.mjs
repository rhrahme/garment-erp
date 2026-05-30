/**
 * Import ClickUp get_task payloads from agent-tools/*.txt into cache build detailed/.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeTask } from "./build-clickup-import-cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DETAILED_DIR = path.join(ROOT, "src/data/.clickup-cache-build/detailed");
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

function main() {
  fs.mkdirSync(DETAILED_DIR, { recursive: true });
  let files = 0;
  let tasks = 0;
  for (const name of fs.readdirSync(AGENT_TOOLS_DIR)) {
    if (!name.endsWith(".txt")) continue;
    const filePath = path.join(AGENT_TOOLS_DIR, name);
    let task;
    try {
      task = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      continue;
    }
    if (!task?.id) continue;
    const flat = flattenTaskTree(task);
    if (!flat.some((t) => t.custom_fields?.length)) continue;
    for (const normalized of flat) {
      fs.writeFileSync(
        path.join(DETAILED_DIR, `${normalized.id}.json`),
        `${JSON.stringify(normalized, null, 2)}\n`
      );
      tasks += 1;
    }
    files += 1;
  }
  console.log(`Imported ${tasks} tasks from ${files} agent-tools files`);
}

main();
