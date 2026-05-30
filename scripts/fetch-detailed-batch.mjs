/**
 * Read task IDs from argv, fetch via stdin lines of detailed JSON objects (from MCP get_task).
 * Usage: while read ids; do get_task; done | node fetch-detailed-batch.mjs
 * Or: node fetch-detailed-batch.mjs < ids.txt  (expects detailed JSON per line on stdin after each id prompt - not used)
 *
 * Simpler: node fetch-detailed-batch.mjs --stdin-jsonl  (one detailed task JSON per line on stdin)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const lines = Buffer.concat(chunks).toString("utf8").trim().split("\n").filter(Boolean);

let n = 0;
for (const line of lines) {
  const task = JSON.parse(line);
  if (!task?.id) continue;
  const proc = spawnSync(
    "node",
    ["scripts/build-clickup-import-cache.mjs", "add-detailed"],
    { cwd: ROOT, input: `${JSON.stringify(task)}\n`, encoding: "utf8" }
  );
  if (proc.status !== 0) {
    console.error(`Failed ${task.id}:`, proc.stderr);
    continue;
  }
  n += 1;
}
console.log(`Added ${n} detailed tasks`);
