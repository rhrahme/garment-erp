/**
 * Resume helper: print pending count + next batch IDs for MCP get_task loop.
 * Pair with: save-mcp-task-to-inbox.mjs, flush-mcp-inbox.mjs, ingest-mcp-jsonl.mjs
 *
 * Usage:
 *   node scripts/continue-pending-clickup-detailed.mjs status
 *   node scripts/continue-pending-clickup-detailed.mjs next 25
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const orch = path.join(__dirname, "orchestrate-clickup-mcp-cache.mjs");
const build = path.join(__dirname, "build-clickup-import-cache.mjs");

const cmd = process.argv[2] ?? "status";
const n = process.argv[3] ?? "25";

function run(script, args) {
  const r = spawnSync("node", [script, ...args], { cwd: ROOT, encoding: "utf8" });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status ?? 0;
}

if (cmd === "status") process.exit(run(build, ["status"]));
if (cmd === "next") process.exit(run(orch, ["next-batch", n]));
console.error("Usage: continue-pending-clickup-detailed.mjs status|next [n]");
process.exit(1);
