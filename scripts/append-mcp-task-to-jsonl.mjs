/** Append one MCP get_task JSON (stdin) to mcp-batch.jsonl for batch ingest. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BATCH = path.join(__dirname, "../src/data/.clickup-cache-build/mcp-batch.jsonl");

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const task = JSON.parse(Buffer.concat(chunks).toString("utf8"));
if (!task?.id) {
  console.error("Missing task.id");
  process.exit(1);
}
fs.mkdirSync(path.dirname(BATCH), { recursive: true });
fs.appendFileSync(BATCH, `${JSON.stringify(task)}\n`);
console.log(`Appended ${task.id}`);
