/** Ingest a JSON array file of MCP get_task payloads into detailed cache. */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const build = path.join(__dirname, "build-clickup-import-cache.mjs");
const file = process.argv[2];
if (!file) {
  console.error("Usage: ingest-task-array-file.mjs <tasks.json>");
  process.exit(1);
}
const tasks = JSON.parse(fs.readFileSync(file, "utf8"));
if (!Array.isArray(tasks) || !tasks.length) {
  console.error("Expected non-empty JSON array");
  process.exit(1);
}
const r = spawnSync("node", [build, "add-detailed-batch"], {
  cwd: ROOT,
  input: `${JSON.stringify(tasks)}\n`,
  encoding: "utf8",
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 0);
