/**
 * Flatten MCP get_task (root + nested subtasks) and ingest into detailed cache.
 *
 * Usage:
 *   node scripts/flatten-ingest-mcp-root.mjs path/to/task.json [more.json ...]
 *   echo '$json' | node scripts/flatten-ingest-mcp-root.mjs
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { normalizeTask } from "./build-clickup-import-cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const build = path.join(__dirname, "build-clickup-import-cache.mjs");
const SUMMARIES_PATH = path.join(ROOT, "src/data/.clickup-cache-build/summaries.json");

function loadSummaries() {
  if (!fs.existsSync(SUMMARIES_PATH)) return {};
  return JSON.parse(fs.readFileSync(SUMMARIES_PATH, "utf8"));
}

function flattenTaskTree(task, listOverride) {
  const out = [];
  const normalized = normalizeTask(task, listOverride ?? task.list);
  out.push(normalized);
  for (const subtask of task.subtasks ?? []) {
    out.push(...flattenTaskTree(subtask, subtask.list ?? normalized.list));
  }
  return out;
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return null;
  return JSON.parse(text);
}

function ingestTasks(tasks) {
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
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(JSON.stringify({ ingested: tasks.length, ids: [...new Set(tasks.map((t) => t.id))] }));
}

async function main() {
  const summaries = loadSummaries();
  const files = process.argv.slice(2);
  const tasks = [];

  if (files.length) {
    for (const file of files) {
      const task = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!task?.id) continue;
      tasks.push(...flattenTaskTree(task, summaries[task.id]?.list ?? task.list));
    }
  } else {
    const task = await readStdinJson();
    if (!task?.id) throw new Error("Expected task JSON on stdin or file paths");
    tasks.push(...flattenTaskTree(task, summaries[task.id]?.list ?? task.list));
  }

  ingestTasks(tasks);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
