/** Save one MCP get_task JSON from stdin to mcp-inbox/{id}.json */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INBOX = path.join(__dirname, "../src/data/.clickup-cache-build/mcp-inbox");

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const task = JSON.parse(Buffer.concat(chunks).toString("utf8"));
if (!task?.id) {
  console.error("Missing task.id");
  process.exit(1);
}
fs.mkdirSync(INBOX, { recursive: true });
fs.writeFileSync(path.join(INBOX, `${task.id}.json`), `${JSON.stringify(task)}\n`);
console.log(`Saved ${task.id}`);
