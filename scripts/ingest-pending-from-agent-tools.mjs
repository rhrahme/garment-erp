/**
 * Ingest pending tasks from agent-tools/*.txt and mcp-inbox/*.json
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE_DIR = path.join(ROOT, "src/data/.clickup-cache-build");
const SUMMARIES_PATH = path.join(STATE_DIR, "summaries.json");
const DETAILED_DIR = path.join(STATE_DIR, "detailed");
const AGENT_TOOLS = path.join(
  process.env.HOME,
  ".cursor/projects/Users-ralphrahme-Projects-garment-erp/agent-tools"
);
const INBOX = path.join(STATE_DIR, "mcp-inbox");
const flatten = path.join(__dirname, "flatten-ingest-mcp-root.mjs");

function pendingIds() {
  const summaries = JSON.parse(fs.readFileSync(SUMMARIES_PATH, "utf8"));
  const detailed = new Set(
    fs.readdirSync(DETAILED_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
  );
  return Object.keys(summaries).filter((id) => !detailed.has(id));
}

function ingestFile(filePath) {
  const r = spawnSync("node", [flatten, filePath], { cwd: ROOT, encoding: "utf8" });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status === 0;
}

const pending = pendingIds();
let ingested = 0;
const seen = new Set();

for (const name of fs.readdirSync(AGENT_TOOLS)) {
  if (!name.endsWith(".txt")) continue;
  const id = name.replace(/\.txt$/, "");
  if (!pending.includes(id) || seen.has(id)) continue;
  const filePath = path.join(AGENT_TOOLS, name);
  if (ingestFile(filePath)) {
    seen.add(id);
    ingested++;
  }
}

if (fs.existsSync(INBOX)) {
  for (const name of fs.readdirSync(INBOX)) {
    if (!name.endsWith(".json")) continue;
    const id = name.replace(/\.json$/, "");
    if (!pending.includes(id) || seen.has(id)) continue;
    if (ingestFile(path.join(INBOX, name))) {
      seen.add(id);
      ingested++;
    }
  }
}

const still = pendingIds().length;
console.log(JSON.stringify({ ingested, still_pending: still, total_pending: pending.length }));