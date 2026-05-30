/**
 * Scan agent-tools/*.txt for ClickUp task JSON matching pending detailed IDs and ingest.
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
const flatten = path.join(__dirname, "flatten-ingest-mcp-root.mjs");

function pendingIds() {
  const summaries = JSON.parse(fs.readFileSync(path.join(STATE_DIR, "summaries.json"), "utf8"));
  const detailed = new Set(
    fs.readdirSync(path.join(STATE_DIR, "detailed")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
  );
  return new Set(Object.keys(summaries).filter((id) => !detailed.has(id)));
}

function main() {
  const pending = pendingIds();
  const byId = new Map();
  if (!fs.existsSync(AGENT_TOOLS)) {
    console.log(JSON.stringify({ ingested: 0, matched: 0, pending: pending.size }));
    return;
  }
  for (const name of fs.readdirSync(AGENT_TOOLS)) {
    if (!name.endsWith(".txt")) continue;
    const filePath = path.join(AGENT_TOOLS, name);
    try {
      const task = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (task?.id && pending.has(String(task.id))) {
        const prev = byId.get(String(task.id));
        const fields = task.custom_fields?.length ?? 0;
        const prevFields = prev ? JSON.parse(fs.readFileSync(prev, "utf8")).custom_fields?.length ?? 0 : -1;
        if (!prev || fields >= prevFields) byId.set(String(task.id), filePath);
      }
    } catch {
      /* skip */
    }
  }
  const files = [...byId.values()];
  if (!files.length) {
    console.log(JSON.stringify({ ingested: 0, matched: 0, pending: pending.size }));
    return;
  }
  const r = spawnSync("node", [flatten, ...files], { cwd: ROOT, encoding: "utf8" });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const pendingAfter = pendingIds();
  console.log(
    JSON.stringify({
      matched: files.length,
      pending_before: pending.size,
      pending_after: pendingAfter.size,
      exit: r.status ?? 0,
    })
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}

main();
