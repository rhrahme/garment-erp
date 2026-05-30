/**
 * Ingest agent-tools/*.txt payloads whose task IDs are still pending detailed fetch.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const AGENT_TOOLS = path.join(
  process.env.HOME,
  ".cursor/projects/Users-ralphrahme-Projects-garment-erp/agent-tools"
);
const STATE_DIR = path.join(ROOT, "src/data/.clickup-cache-build");
const build = path.join(__dirname, "build-clickup-import-cache.mjs");

function pendingSet() {
  const summaries = JSON.parse(fs.readFileSync(path.join(STATE_DIR, "summaries.json"), "utf8"));
  const detailed = new Set(
    fs
      .readdirSync(path.join(STATE_DIR, "detailed"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
  );
  return new Set(Object.keys(summaries).filter((id) => !detailed.has(id)));
}

function main() {
  const pending = pendingSet();
  const byId = new Map();
  if (!fs.existsSync(AGENT_TOOLS)) {
    console.log(JSON.stringify({ ingested: 0, pending: pending.size }));
    return;
  }
  for (const file of fs.readdirSync(AGENT_TOOLS)) {
    if (!file.endsWith(".txt")) continue;
    try {
      const task = JSON.parse(fs.readFileSync(path.join(AGENT_TOOLS, file), "utf8"));
      if (!task?.id || !pending.has(String(task.id))) continue;
      byId.set(String(task.id), task);
    } catch {
      /* skip */
    }
  }
  const tasks = [...byId.values()];
  if (!tasks.length) {
    console.log(JSON.stringify({ ingested: 0, pending: pending.size }));
    return;
  }
  const r = spawnSync("node", [build, "add-detailed-batch"], {
    cwd: ROOT,
    input: `${JSON.stringify(tasks)}\n`,
    encoding: "utf8",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(JSON.stringify({ ingested: tasks.length, ids: tasks.map((t) => t.id) }));
}

main();
