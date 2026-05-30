/**
 * Save MCP get_task JSON from a file path into mcp-inbox, then ingest inbox batch.
 * Usage: node scripts/mcp-save-and-ingest.mjs /path/to/task.json [/path/to/task2.json ...]
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const INBOX = path.join(ROOT, "src/data/.clickup-cache-build/mcp-inbox");
const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: mcp-save-and-ingest.mjs <task.json> [...]");
  process.exit(1);
}
fs.mkdirSync(INBOX, { recursive: true });
for (const file of files) {
  const task = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!task?.id) continue;
  fs.writeFileSync(path.join(INBOX, `${task.id}.json`), `${JSON.stringify(task)}\n`);
}
const r = spawnSync("node", [path.join(__dirname, "ingest-mcp-inbox-batch.mjs")], {
  cwd: ROOT,
  encoding: "utf8",
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 0);
