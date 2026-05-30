/** Write MCP get_task JSON (array or single object) from file to mcp-inbox/{id}.json */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const INBOX = path.join(ROOT, "src/data/.clickup-cache-build/mcp-inbox");

const src = process.argv[2];
if (!src) {
  console.error("Usage: write-mcp-tasks-to-inbox.mjs <tasks.json>");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(src, "utf8"));
const tasks = Array.isArray(data) ? data : [data];
fs.mkdirSync(INBOX, { recursive: true });

for (const task of tasks) {
  if (!task?.id) continue;
  fs.writeFileSync(path.join(INBOX, `${task.id}.json`), `${JSON.stringify(task)}\n`);
}
console.log(JSON.stringify({ written: tasks.filter((t) => t?.id).length }));
