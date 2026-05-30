/**
 * Scan all agent-tools/*.txt for get_task JSON matching pending IDs.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE_DIR = path.join(ROOT, "src/data/.clickup-cache-build");
const AGENT_TOOLS = path.join(
  process.env.HOME,
  ".cursor/projects/Users-ralphrahme-Projects-garment-erp/agent-tools"
);
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

function extractFromText(text, pending) {
  const byId = new Map();
  const re = /\{"id":"(86[a-z0-9]+)"/g;
  let m;
  while ((m = re.exec(text))) {
    const id = m[1];
    if (!pending.has(id)) continue;
    const start = m.index;
    let depth = 0;
    let end = start;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end <= start) continue;
    try {
      const obj = JSON.parse(text.slice(start, end));
      if (obj?.id && obj.custom_fields) byId.set(String(obj.id), obj);
    } catch {
      /* skip */
    }
  }
  return byId;
}

function extractFromPaths(paths, pending) {
  const merged = new Map();
  for (const file of paths) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const [id, task] of extractFromText(text, pending)) merged.set(id, task);
  }
  return merged;
}

function main() {
  const pending = pendingSet();
  const merged = new Map();
  const tmpCu = fs.existsSync("/tmp")
    ? fs.readdirSync("/tmp").filter((n) => n.startsWith("cu-") && n.endsWith(".json")).map((n) => `/tmp/${n}`)
    : [];
  for (const [id, task] of extractFromPaths(tmpCu, pending)) merged.set(id, task);
  for (const name of fs.readdirSync(AGENT_TOOLS)) {
    if (!name.endsWith(".txt")) continue;
    const text = fs.readFileSync(path.join(AGENT_TOOLS, name), "utf8");
    for (const [id, task] of extractFromText(text, pending)) merged.set(id, task);
  }
  const tasks = [...merged.values()];
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
  const still = pendingSet().size;
  console.log(JSON.stringify({ extracted: tasks.length, still_pending: still }));
}

main();
