/** After MCP fetch batch: sync agent-tools, flush, ingest, transcripts, status */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function run(script, args = []) {
  const r = spawnSync("node", [path.join(__dirname, script), ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status ?? 0;
}

run("sync-agent-tools-to-inbox.mjs");
run("flush-mcp-inbox.mjs");
run("flush-mcp-jsonl-batch.mjs");
run("ingest-all-agent-tools-pending.mjs");
run("extract-mcp-tasks-from-transcripts.mjs");
run("run-mcp-pending-loop.mjs", ["status"]);
