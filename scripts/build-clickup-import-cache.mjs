/**
 * Merge normalized ClickUp task payloads into clickup-import-cache.json.
 *
 * Usage:
 *   node scripts/build-clickup-import-cache.mjs write-summary < summaries.json
 *   node scripts/build-clickup-import-cache.mjs add-detailed < detailed.json
 *   node scripts/build-clickup-import-cache.mjs finalize
 *   node scripts/build-clickup-import-cache.mjs status
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CACHE_PATH = path.join(ROOT, "src/data/clickup-import-cache.json");
const STATE_DIR = path.join(ROOT, "src/data/.clickup-cache-build");
const SUMMARIES_PATH = path.join(STATE_DIR, "summaries.json");
const DETAILED_DIR = path.join(STATE_DIR, "detailed");

export function normalizeTask(task, listOverride) {
  const list = listOverride ?? task.list;
  const normalized = {
    id: String(task.id),
    name: task.name,
    parent: task.parent ?? null,
    top_level_parent: task.top_level_parent ?? null,
    date_created: task.date_created,
    date_updated: task.date_updated,
    list: list ? { id: String(list.id), name: list.name ?? "" } : undefined,
  };
  if (task.custom_fields?.length) {
    normalized.custom_fields = task.custom_fields.map((field) => {
      const out = {
        id: field.id,
        name: field.name,
        type: field.type,
      };
      if (field.type_config) out.type_config = field.type_config;
      if (field.value !== undefined && field.value !== null) out.value = field.value;
      return out;
    });
  }
  return normalized;
}

function ensureStateDir() {
  fs.mkdirSync(DETAILED_DIR, { recursive: true });
}

function loadSummaries() {
  if (!fs.existsSync(SUMMARIES_PATH)) return {};
  return JSON.parse(fs.readFileSync(SUMMARIES_PATH, "utf8"));
}

function saveSummaries(map) {
  ensureStateDir();
  fs.writeFileSync(SUMMARIES_PATH, `${JSON.stringify(map, null, 2)}\n`);
}

function loadDetailedIds() {
  if (!fs.existsSync(DETAILED_DIR)) return new Set();
  return new Set(
    fs
      .readdirSync(DETAILED_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
  );
}

function writeDetailed(task, listOverride) {
  ensureStateDir();
  const normalized = normalizeTask(task, listOverride);
  fs.writeFileSync(
    path.join(DETAILED_DIR, `${normalized.id}.json`),
    `${JSON.stringify(normalized, null, 2)}\n`
  );
}

function collectMissingParentIds(tasks, knownIds) {
  const missing = new Set();
  for (const task of tasks) {
    for (const parentId of [task.parent, task.top_level_parent]) {
      if (parentId && !knownIds.has(String(parentId))) missing.add(String(parentId));
    }
  }
  return [...missing];
}

function finalizeCache() {
  const summaries = loadSummaries();
  const detailedIds = loadDetailedIds();
  const byId = new Map();

  for (const [id, summary] of Object.entries(summaries)) {
    if (detailedIds.has(id)) {
      const task = JSON.parse(fs.readFileSync(path.join(DETAILED_DIR, `${id}.json`), "utf8"));
      byId.set(id, task);
    } else {
      byId.set(id, normalizeTask(summary, summary.list));
    }
  }

  let pending = collectMissingParentIds([...byId.values()], new Set([...byId.keys(), ...Object.keys(summaries)]));
  while (pending.length) {
    for (const parentId of pending) {
      if (byId.has(parentId)) continue;
      const summary = summaries[parentId];
      if (summary) {
        byId.set(parentId, normalizeTask(summary, summary.list));
      }
    }
    pending = collectMissingParentIds([...byId.values()], new Set([...byId.keys(), ...Object.keys(summaries)]));
    if (pending.every((id) => !summaries[id] && !byId.has(id))) break;
  }

  const tasks = [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(tasks, null, 2)}\n`);
  return {
    total: tasks.length,
    summaries: Object.keys(summaries).length,
    detailed: detailedIds.size,
    missing_detailed: Object.keys(summaries).filter((id) => !detailedIds.has(id)).length,
  };
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return null;
  return JSON.parse(text);
}

async function main() {
  const cmd = process.argv[2] ?? "status";
  ensureStateDir();

  if (cmd === "write-summary") {
    const payload = await readStdinJson();
    if (!payload?.tasks?.length) {
      console.log("No tasks in payload");
      return;
    }
    const map = loadSummaries();
    for (const task of payload.tasks) {
      map[task.id] = { id: task.id, name: task.name, list: task.list };
    }
    saveSummaries(map);
    console.log(`Summaries: ${Object.keys(map).length} unique task IDs`);
    return;
  }

  if (cmd === "add-summary-batch") {
    const batch = await readStdinJson();
    if (!Array.isArray(batch)) throw new Error("Expected JSON array of summary tasks");
    const map = loadSummaries();
    for (const task of batch) {
      map[task.id] = { id: task.id, name: task.name, list: task.list };
    }
    saveSummaries(map);
    console.log(`Summaries: ${Object.keys(map).length} unique task IDs`);
    return;
  }

  if (cmd === "add-detailed") {
    const task = await readStdinJson();
    if (!task?.id) throw new Error("Expected detailed task object with id");
    const summaries = loadSummaries();
    const listOverride = summaries[task.id]?.list ?? task.list;
    writeDetailed(task, listOverride);
    console.log(`Stored detailed task ${task.id}`);
    return;
  }

  if (cmd === "add-detailed-batch") {
    const tasks = await readStdinJson();
    if (!Array.isArray(tasks)) throw new Error("Expected JSON array of detailed tasks");
    const summaries = loadSummaries();
    for (const task of tasks) {
      if (!task?.id) continue;
      writeDetailed(task, summaries[task.id]?.list ?? task.list);
    }
    console.log(`Stored ${tasks.length} detailed tasks`);
    return;
  }

  if (cmd === "pending-ids") {
    const summaries = loadSummaries();
    const detailed = loadDetailedIds();
    const pending = Object.keys(summaries).filter((id) => !detailed.has(id));
    console.log(JSON.stringify(pending));
    return;
  }

  if (cmd === "finalize") {
    const result = finalizeCache();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === "status") {
    const summaries = loadSummaries();
    const detailed = loadDetailedIds();
    const pending = Object.keys(summaries).filter((id) => !detailed.has(id));
    console.log(
      JSON.stringify(
        {
          summaries: Object.keys(summaries).length,
          detailed: detailed.size,
          pending: pending.length,
          cache_exists: fs.existsSync(CACHE_PATH),
        },
        null,
        2
      )
    );
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
