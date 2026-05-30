/**
 * Save MCP get_task payloads into cache build (batch file or per-id files).
 * Usage:
 *   node scripts/save-mcp-detailed-tasks.mjs < tasks.json   (JSON array)
 *   node scripts/save-mcp-detailed-tasks.mjs --dir <inboxDir>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const build = path.join(__dirname, "build-clickup-import-cache.mjs");

async function readStdinJson() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function main() {
  const args = process.argv.slice(2);
  let tasks;
  if (args[0] === "--dir") {
    const dir = args[1];
    tasks = [];
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      tasks.push(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
    }
  } else {
    tasks = readStdinJson();
  }

  Promise.resolve(tasks)
    .then((list) => {
      if (!Array.isArray(list)) throw new Error("Expected JSON array");
      const r = spawnSync("node", [build, "add-detailed-batch"], {
        cwd: ROOT,
        input: `${JSON.stringify(list)}\n`,
        encoding: "utf8",
      });
      if (r.stdout) process.stdout.write(r.stdout);
      if (r.stderr) process.stderr.write(r.stderr);
      process.exit(r.status ?? 0);
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}

main();
