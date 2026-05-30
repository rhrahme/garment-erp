/**
 * Ingest all *.json task files from mcp-inbox, then delete them.
 * Usage: node scripts/flush-mcp-inbox.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const INBOX = path.join(ROOT, "src/data/.clickup-cache-build/mcp-inbox");
const build = path.join(__dirname, "build-clickup-import-cache.mjs");

function main() {
  if (!fs.existsSync(INBOX)) {
    console.log(JSON.stringify({ ingested: 0 }));
    return;
  }
  const tasks = [];
  for (const name of fs.readdirSync(INBOX)) {
    if (!name.endsWith(".json")) continue;
    tasks.push(JSON.parse(fs.readFileSync(path.join(INBOX, name), "utf8")));
  }
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
  for (const name of fs.readdirSync(INBOX)) {
    if (name.endsWith(".json")) fs.unlinkSync(path.join(INBOX, name));
  }
  console.log(JSON.stringify({ ingested: tasks.length }));
}

main();
