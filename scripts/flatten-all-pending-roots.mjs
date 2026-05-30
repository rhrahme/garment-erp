#!/usr/bin/env node
/**
 * Flatten all pending root tasks from agent-tools/*.txt (with subtasks) into detailed cache.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const AT = path.join(
  process.env.HOME,
  ".cursor/projects/Users-ralphrahme-Projects-garment-erp/agent-tools"
);
const flatten = path.join(ROOT, "scripts/flatten-ingest-mcp-root.mjs");
const STATE = path.join(ROOT, "src/data/.clickup-cache-build");
const SUMMARIES = path.join(STATE, "summaries.json");
const DETAILED = path.join(STATE, "detailed");

const summaries = JSON.parse(fs.readFileSync(SUMMARIES, "utf8"));
const detailed = new Set(
  fs.existsSync(DETAILED) ? fs.readdirSync(DETAILED).filter((f) => f.endsWith(".json")) : []
);
const pending = new Set(Object.keys(summaries).filter((id) => !detailed.has(id)));

let done = 0;
for (const name of fs.readdirSync(AT)) {
  if (!name.endsWith(".txt")) continue;
  let task;
  try {
    task = JSON.parse(fs.readFileSync(path.join(AT, name), "utf8"));
  } catch {
    continue;
  }
  if (!task?.id || !pending.has(String(task.id))) continue;
  if (!task.subtasks?.length && !task.custom_fields?.length) continue;
  const r = spawnSync("node", [flatten, path.join(AT, name)], { cwd: ROOT, encoding: "utf8" });
  if (r.status === 0) done++;
}
console.log(JSON.stringify({ flattened: done, pending: pending.size }));
