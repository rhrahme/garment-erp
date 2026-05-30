/**
 * Extract clickup_get_task JSON from agent transcript .jsonl files for pending IDs.
 * Usage: node scripts/extract-mcp-tasks-from-transcripts.mjs [transcriptDir]
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE_DIR = path.join(ROOT, "src/data/.clickup-cache-build");
const build = path.join(__dirname, "build-clickup-import-cache.mjs");
const persistNdjson = path.join(__dirname, "mcp-persist-ndjson.mjs");

const transcriptDir =
  process.argv[2] ??
  path.join(process.env.HOME, ".cursor/projects/Users-ralphrahme-Projects-garment-erp/agent-transcripts");

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

function extractFromText(text, pending, merged) {
  const re = /\{"id":"(86[a-z0-9]+)"/g;
  let m;
  while ((m = re.exec(text))) {
    const id = m[1];
    if (!pending.has(id) || merged.has(id)) continue;
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
      if (obj?.id && obj.custom_fields) merged.set(String(obj.id), obj);
    } catch {
      /* skip */
    }
  }
}

function walkJsonlFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkJsonlFiles(p, out);
    else if (name.endsWith(".jsonl")) out.push(p);
  }
}

function main() {
  const pending = pendingSet();
  const merged = new Map();
  const files = [];
  walkJsonlFiles(transcriptDir, files);
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    extractFromText(text, pending, merged);
  }
  const tasks = [...merged.values()];
  if (!tasks.length) {
    console.log(JSON.stringify({ extracted: 0, pending: pending.size }));
    return;
  }
  const ndjson = `${tasks.map((t) => JSON.stringify(t)).join("\n")}\n`;
  const pr = spawnSync("node", [persistNdjson], { cwd: ROOT, input: ndjson, encoding: "utf8" });
  if (pr.stdout) process.stdout.write(pr.stdout);
  if (pr.stderr) process.stderr.write(pr.stderr);
  const r = spawnSync("node", [build, "add-detailed-batch"], {
    cwd: ROOT,
    input: `${JSON.stringify(tasks)}\n`,
    encoding: "utf8",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const still = pendingSet().size;
  console.log(JSON.stringify({ extracted: tasks.length, ids: tasks.map((t) => t.id), still_pending: still }));
}

main();
