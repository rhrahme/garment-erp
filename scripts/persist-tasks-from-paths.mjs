/** Copy task JSON files into mcp-inbox/{id}.json. Usage: node persist-tasks-from-paths.mjs file1.json ... */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INBOX = path.join(__dirname, "../src/data/.clickup-cache-build/mcp-inbox");

for (const file of process.argv.slice(2)) {
  const task = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!task?.id) {
    console.error(`Skip ${file}: no task.id`);
    continue;
  }
  fs.mkdirSync(INBOX, { recursive: true });
  fs.writeFileSync(path.join(INBOX, `${task.id}.json`), `${JSON.stringify(task)}\n`);
  console.log(`Saved ${task.id}`);
}
