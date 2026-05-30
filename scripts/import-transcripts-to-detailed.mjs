/**
 * Extract clickup_get_task JSON results from agent transcript jsonl files
 * and ingest into detailed cache for pending task IDs.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TRANSCRIPTS = path.join(
  process.env.HOME,
  ".cursor/projects/Users-ralphrahme-Projects-garment-erp/agent-transcripts"
);
const build = path.join(__dirname, "build-clickup-import-cache.mjs");
const STATE_DIR = path.join(ROOT, "src/data/.clickup-cache-build");

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

function walkJsonlFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkJsonlFiles(p, out);
    else if (name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

function extractTasksFromLine(line, pending) {
  const found = [];
  if (!line.includes('"id"')) return found;
  // MCP tool results often appear as JSON objects with task id
  const re = /\{"id":"(86[a-z0-9]+)"/g;
  let m;
  while ((m = re.exec(line))) {
    const start = m.index;
    // find balanced JSON object from start
    let depth = 0;
    let end = start;
    for (let i = start; i < line.length; i++) {
      if (line[i] === "{") depth++;
      else if (line[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end <= start) continue;
    try {
      const obj = JSON.parse(line.slice(start, end));
      if (obj?.id && pending.has(String(obj.id)) && obj.custom_fields) found.push(obj);
    } catch {
      /* skip */
    }
  }
  return found;
}

function main() {
  const pending = pendingSet();
  const byId = new Map();
  for (const file of walkJsonlFiles(TRANSCRIPTS)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (const line of lines) {
      for (const task of extractTasksFromLine(line, pending)) {
        byId.set(String(task.id), task);
      }
    }
  }
  const tasks = [...byId.values()];
  if (!tasks.length) {
    console.log(JSON.stringify({ extracted: 0, pending: pending.size }));
    return;
  }
  const r = spawnSync("node", [build, "add-detailed-batch"], {
    cwd: ROOT,
    input: `${JSON.stringify(tasks)}\n`,
    encoding: "utf8",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  console.log(JSON.stringify({ extracted: tasks.length, ids: tasks.map((t) => t.id) }));
}

main();
