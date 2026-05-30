/**
 * Ingest one JSON object per line (MCP get_task payloads) into detailed cache.
 * Usage: node scripts/ingest-mcp-jsonl.mjs < tasks.jsonl
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const build = path.join(__dirname, "build-clickup-import-cache.mjs");

async function main() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const lines = Buffer.concat(chunks).toString("utf8").trim().split("\n").filter(Boolean);
  const tasks = [];
  for (const line of lines) {
    const task = JSON.parse(line);
    if (task?.id) tasks.push(task);
  }
  if (!tasks.length) {
    console.log(JSON.stringify({ ingested: 0 }));
    return;
  }
  const r = spawnSync("node", [build, "add-detailed-batch"], {
    cwd: ROOT,
    input: `${JSON.stringify(tasks)}\n`,
    encoding: "utf8",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
