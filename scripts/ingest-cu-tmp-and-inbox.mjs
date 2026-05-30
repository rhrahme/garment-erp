/**
 * Ingest /tmp/cu-*.json and mcp-inbox/*.json into detailed cache, then clean up.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const INBOX = path.join(ROOT, "src/data/.clickup-cache-build/mcp-inbox");
const build = path.join(__dirname, "build-clickup-import-cache.mjs");

function collectTasks() {
  const tasks = [];
  const seen = new Set();
  const add = (task) => {
    if (!task?.id) return;
    const id = String(task.id);
    if (seen.has(id)) return;
    seen.add(id);
    tasks.push(task);
  };
  if (fs.existsSync(INBOX)) {
    for (const name of fs.readdirSync(INBOX)) {
      if (!name.endsWith(".json")) continue;
      add(JSON.parse(fs.readFileSync(path.join(INBOX, name), "utf8")));
    }
  }
  if (fs.existsSync("/tmp")) {
    for (const name of fs.readdirSync("/tmp")) {
      if (!name.startsWith("cu-") || !name.endsWith(".json")) continue;
      add(JSON.parse(fs.readFileSync(path.join("/tmp", name), "utf8")));
    }
  }
  return tasks;
}

function main() {
  const tasks = collectTasks();
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
  if (fs.existsSync(INBOX)) {
    for (const name of fs.readdirSync(INBOX)) {
      if (name.endsWith(".json")) fs.unlinkSync(path.join(INBOX, name));
    }
  }
  if (fs.existsSync("/tmp")) {
    for (const name of fs.readdirSync("/tmp")) {
      if (name.startsWith("cu-") && name.endsWith(".json")) fs.unlinkSync(path.join("/tmp", name));
    }
  }
  console.log(JSON.stringify({ ingested: tasks.length, ids: tasks.map((t) => t.id) }));
}

main();
