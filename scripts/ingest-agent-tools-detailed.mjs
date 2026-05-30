/**
 * Ingest ClickUp get_task JSON from agent-tools/*.txt into cache build detailed/.
 * Skips files already in detailed/. Processes all parseable task payloads.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const AGENT_TOOLS_DIR = path.join(
  process.env.HOME,
  ".cursor/projects/Users-ralphrahme-Projects-garment-erp/agent-tools"
);
const DETAILED_DIR = path.join(ROOT, "src/data/.clickup-cache-build/detailed");
const build = path.join(__dirname, "build-clickup-import-cache.mjs");

function loadDetailedIds() {
  if (!fs.existsSync(DETAILED_DIR)) return new Set();
  return new Set(
    fs.readdirSync(DETAILED_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
  );
}

function main() {
  const detailed = loadDetailedIds();
  const tasks = [];
  if (!fs.existsSync(AGENT_TOOLS_DIR)) {
    console.log(JSON.stringify({ ingested: 0, reason: "no agent-tools dir" }));
    return;
  }
  for (const file of fs.readdirSync(AGENT_TOOLS_DIR)) {
    if (!file.endsWith(".txt")) continue;
    const filePath = path.join(AGENT_TOOLS_DIR, file);
    try {
      const task = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!task?.id || detailed.has(String(task.id))) continue;
      if (!task.custom_fields?.length && !task.name) continue;
      tasks.push(task);
      detailed.add(String(task.id));
    } catch {
      /* skip */
    }
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

main();
