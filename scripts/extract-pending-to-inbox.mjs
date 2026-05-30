/** Extract pending task JSON from agent-tools into mcp-inbox/{id}.json */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const INBOX = path.join(ROOT, "src/data/.clickup-cache-build/mcp-inbox");
const AGENT_TOOLS = path.join(
  process.env.HOME,
  ".cursor/projects/Users-ralphrahme-Projects-garment-erp/agent-tools"
);

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Usage: extract-pending-to-inbox.mjs <taskId> [...]");
  process.exit(1);
}

function extract(text, id) {
  const re = new RegExp(`\\{"id":"${id}"`);
  const m = re.exec(text);
  if (!m) return null;
  let depth = 0;
  const start = m.index;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          const obj = JSON.parse(text.slice(start, i + 1));
          if (obj?.id && obj.custom_fields?.length > 10) return obj;
        } catch {
          return null;
        }
        return null;
      }
    }
  }
  return null;
}

fs.mkdirSync(INBOX, { recursive: true });
let written = 0;
const missing = [];

for (const id of ids) {
  if (fs.existsSync(path.join(INBOX, `${id}.json`))) {
    written++;
    continue;
  }
  let task = null;
  for (const name of fs.readdirSync(AGENT_TOOLS)) {
    if (!name.endsWith(".txt")) continue;
    task = extract(fs.readFileSync(path.join(AGENT_TOOLS, name), "utf8"), id);
    if (task) break;
  }
  if (task) {
    fs.writeFileSync(path.join(INBOX, `${id}.json`), `${JSON.stringify(task)}\n`);
    written++;
  } else {
    missing.push(id);
  }
}

console.log(JSON.stringify({ written, missing, total: ids.length }));
