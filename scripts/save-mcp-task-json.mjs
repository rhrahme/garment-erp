/** Save one MCP get_task JSON file to mcp-inbox, agent-tools, and /tmp/cu-{id}.json */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const INBOX = path.join(ROOT, "src/data/.clickup-cache-build/mcp-inbox");
const AGENT_TOOLS = path.join(
  process.env.HOME,
  ".cursor/projects/Users-ralphrahme-Projects-garment-erp/agent-tools"
);

const src = process.argv[2];
if (!src) {
  console.error("Usage: save-mcp-task-json.mjs <task.json>");
  process.exit(1);
}

const task = JSON.parse(fs.readFileSync(src, "utf8"));
if (!task?.id) {
  console.error("Missing task.id");
  process.exit(1);
}

const payload = `${JSON.stringify(task)}\n`;
fs.mkdirSync(INBOX, { recursive: true });
fs.mkdirSync(AGENT_TOOLS, { recursive: true });
fs.writeFileSync(path.join(INBOX, `${task.id}.json`), payload);
fs.writeFileSync(path.join(AGENT_TOOLS, `${task.id}.txt`), payload);
fs.writeFileSync(`/tmp/cu-${task.id}.json`, payload);
console.log(`Saved ${task.id}`);
