/**
 * Extract task JSON from all agent-tools/*.txt into mcp-inbox/{id}.json
 * for pending IDs (or all with --all).
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE_DIR = path.join(ROOT, "src/data/.clickup-cache-build");
const INBOX = path.join(STATE_DIR, "mcp-inbox");
const AGENT_TOOLS = path.join(
  process.env.HOME,
  ".cursor/projects/Users-ralphrahme-Projects-garment-erp/agent-tools"
);

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

function extractFromText(text, filter) {
  const byId = new Map();
  const re = /\{"id":"(86[a-z0-9]+)"/g;
  let m;
  while ((m = re.exec(text))) {
    const id = m[1];
    if (filter && !filter.has(id)) continue;
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

const all = process.argv.includes("--all");
const pending = all ? null : pendingSet();
fs.mkdirSync(INBOX, { recursive: true });
const merged = new Map();
for (const name of fs.readdirSync(AGENT_TOOLS)) {
  if (!name.endsWith(".txt")) continue;
  const text = fs.readFileSync(path.join(AGENT_TOOLS, name), "utf8");
  for (const [id, task] of extractFromText(text, pending)) merged.set(id, task);
}
let written = 0;
for (const [id, task] of merged) {
  fs.writeFileSync(path.join(INBOX, `${id}.json`), `${JSON.stringify(task)}\n`);
  fs.writeFileSync(path.join(AGENT_TOOLS, `${id}.txt`), `${JSON.stringify(task)}\n`);
  written++;
}
console.log(JSON.stringify({ synced: written }));
if (written) {
  const r = spawnSync("node", [path.join(__dirname, "ingest-mcp-inbox-batch.mjs")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
}
