/**
 * Orchestrate ClickUp cache build from MCP filter/get results stored as JSON files.
 *
 * Save filter page:  echo '$json' > src/data/.clickup-cache-build/pages/LISTID_pN.json
 * Merge pages:       node scripts/orchestrate-clickup-mcp-cache.mjs merge-pages
 * Save detailed:     node scripts/orchestrate-clickup-mcp-cache.mjs save-detailed < tasks.json
 * Next batch:        node scripts/orchestrate-clickup-mcp-cache.mjs next-batch 20
 * Missing parents:   node scripts/orchestrate-clickup-mcp-cache.mjs missing-parents
 * Status:            node scripts/orchestrate-clickup-mcp-cache.mjs status
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeTask } from "./build-clickup-import-cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE_DIR = path.join(ROOT, "src/data/.clickup-cache-build");
const PAGES_DIR = path.join(STATE_DIR, "pages");
const SUMMARIES_PATH = path.join(STATE_DIR, "summaries.json");
const DETAILED_DIR = path.join(STATE_DIR, "detailed");

function ensureDirs() {
  fs.mkdirSync(PAGES_DIR, { recursive: true });
  fs.mkdirSync(DETAILED_DIR, { recursive: true });
}

function loadSummaries() {
  if (!fs.existsSync(SUMMARIES_PATH)) return {};
  return JSON.parse(fs.readFileSync(SUMMARIES_PATH, "utf8"));
}

function saveSummaries(map) {
  ensureDirs();
  fs.writeFileSync(SUMMARIES_PATH, `${JSON.stringify(map, null, 2)}\n`);
}

function loadDetailedIds() {
  if (!fs.existsSync(DETAILED_DIR)) return new Set();
  return new Set(
    fs.readdirSync(DETAILED_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
  );
}

function writeDetailed(task, listOverride) {
  ensureDirs();
  const normalized = normalizeTask(task, listOverride);
  fs.writeFileSync(
    path.join(DETAILED_DIR, `${normalized.id}.json`),
    `${JSON.stringify(normalized, null, 2)}\n`
  );
}

function mergePages() {
  const map = loadSummaries();
  const files = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, file), "utf8"));
    for (const task of payload.tasks ?? []) {
      map[task.id] = { id: task.id, name: task.name, list: task.list };
    }
  }
  saveSummaries(map);
  console.log(JSON.stringify({ merged_files: files.length, unique_summaries: Object.keys(map).length }));
}

function nextBatch(n) {
  const summaries = loadSummaries();
  const detailed = loadDetailedIds();
  const pending = Object.keys(summaries).filter((id) => !detailed.has(id));
  console.log(JSON.stringify(pending.slice(0, n)));
}

function missingParents() {
  const summaries = loadSummaries();
  const detailed = loadDetailedIds();
  const known = new Set([...Object.keys(summaries), ...detailed]);
  const missing = new Set();
  for (const id of detailed) {
    const task = JSON.parse(fs.readFileSync(path.join(DETAILED_DIR, `${id}.json`), "utf8"));
    for (const pid of [task.parent, task.top_level_parent]) {
      if (pid && !known.has(String(pid))) missing.add(String(pid));
    }
  }
  console.log(JSON.stringify([...missing]));
}

function saveDetailedBatch() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => {
      try {
        const tasks = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!Array.isArray(tasks)) throw new Error("Expected JSON array");
        const summaries = loadSummaries();
        for (const task of tasks) {
          if (!task?.id) continue;
          writeDetailed(task, summaries[task.id]?.list ?? task.list);
        }
        console.log(JSON.stringify({ saved: tasks.length, detailed: loadDetailedIds().size }));
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

function status() {
  const summaries = loadSummaries();
  const detailed = loadDetailedIds();
  const pending = Object.keys(summaries).filter((id) => !detailed.has(id));
  console.log(
    JSON.stringify(
      {
        page_files: fs.existsSync(PAGES_DIR) ? fs.readdirSync(PAGES_DIR).length : 0,
        summaries: Object.keys(summaries).length,
        detailed: detailed.size,
        pending: pending.length,
      },
      null,
      2
    )
  );
}

const cmd = process.argv[2] ?? "status";
ensureDirs();

if (cmd === "merge-pages") mergePages();
else if (cmd === "next-batch") nextBatch(Number(process.argv[3] ?? 20));
else if (cmd === "missing-parents") missingParents();
else if (cmd === "save-detailed") saveDetailedBatch().catch((e) => { console.error(e.message); process.exit(1); });
else if (cmd === "status") status();
else throw new Error(`Unknown command: ${cmd}`);
