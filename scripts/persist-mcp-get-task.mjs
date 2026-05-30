/** Read one MCP get_task JSON from stdin; save to agent-tools/{id}.txt and mcp-inbox/{id}.json */
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

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const task = JSON.parse(Buffer.concat(chunks).toString("utf8"));
if (!task?.id) {
  console.error("Missing task.id");
  process.exit(1);
}
fs.mkdirSync(INBOX, { recursive: true });
fs.mkdirSync(AGENT_TOOLS, { recursive: true });
const payload = `${JSON.stringify(task)}\n`;
fs.writeFileSync(path.join(INBOX, `${task.id}.json`), payload);
fs.writeFileSync(path.join(AGENT_TOOLS, `${task.id}.txt`), payload);
console.log(`Persisted ${task.id}`);
