/**
 * Automated MCP pending fetch loop helper.
 * Reads pending IDs, fetches via ClickUp REST if CLICKUP_API_TOKEN set,
 * otherwise writes batch files for MCP agent to process.
 *
 * Usage:
 *   node scripts/run-mcp-pending-loop.mjs status
 *   node scripts/run-mcp-pending-loop.mjs fetch-rest 25
 *   node scripts/run-mcp-pending-loop.mjs write-batch-file 25
 *   node scripts/run-mcp-pending-loop.mjs ingest-inbox
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { normalizeTask } from "./build-clickup-import-cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE_DIR = path.join(ROOT, "src/data/.clickup-cache-build");
const SUMMARIES_PATH = path.join(STATE_DIR, "summaries.json");
const DETAILED_DIR = path.join(STATE_DIR, "detailed");
const BATCH_DIR = path.join(STATE_DIR, "mcp-batches");
const build = path.join(__dirname, "build-clickup-import-cache.mjs");

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function pendingIds() {
  const summaries = JSON.parse(fs.readFileSync(SUMMARIES_PATH, "utf8"));
  const detailed = new Set(
    fs.readdirSync(DETAILED_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
  );
  return Object.keys(summaries).filter((id) => !detailed.has(id));
}

async function clickUpGet(token, taskId) {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: { Authorization: token, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp ${taskId} (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchRest(n) {
  loadEnvLocal();
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  if (!token) {
    console.error("Missing CLICKUP_API_TOKEN");
    process.exit(1);
  }
  const ids = pendingIds().slice(0, n);
  const summaries = JSON.parse(fs.readFileSync(SUMMARIES_PATH, "utf8"));
  const tasks = [];
  for (const id of ids) {
    try {
      const task = await clickUpGet(token, id);
      tasks.push(task);
      await new Promise((r) => setTimeout(r, 150));
    } catch (e) {
      console.error(String(e.message ?? e));
      if (String(e.message).includes("429")) break;
    }
  }
  if (!tasks.length) {
    console.log(JSON.stringify({ fetched: 0 }));
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

function writeBatchFile(n) {
  fs.mkdirSync(BATCH_DIR, { recursive: true });
  const ids = pendingIds().slice(0, n);
  const file = path.join(BATCH_DIR, `pending-${Date.now()}.json`);
  fs.writeFileSync(file, `${JSON.stringify(ids, null, 2)}\n`);
  console.log(JSON.stringify({ batch_file: file, count: ids.length, ids }));
}

function ingestInbox() {
  const r = spawnSync("node", [path.join(__dirname, "ingest-mcp-inbox-batch.mjs")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 0);
}

const cmd = process.argv[2] ?? "status";
const n = Number(process.argv[3] ?? 25);

if (cmd === "status") {
  const ids = pendingIds();
  console.log(JSON.stringify({ pending: ids.length, next: ids.slice(0, 5) }, null, 2));
} else if (cmd === "fetch-rest") {
  await fetchRest(n);
} else if (cmd === "write-batch-file") {
  writeBatchFile(n);
} else if (cmd === "ingest-inbox") {
  ingestInbox();
} else {
  console.error("Unknown command");
  process.exit(1);
}
