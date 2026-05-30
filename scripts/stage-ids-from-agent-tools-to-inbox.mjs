/** Extract pending task JSON from agent-tools/*.txt into mcp-inbox/{id}.json */
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

const targetIds = new Set(process.argv.slice(2));
if (!targetIds.size) {
  console.error("Usage: stage-ids-from-agent-tools-to-inbox.mjs <taskId> [...]");
  process.exit(1);
}

function extractFromText(text) {
  const byId = new Map();
  const re = /\{"id":"(86[a-z0-9]+)"/g;
  let m;
  while ((m = re.exec(text))) {
    const id = m[1];
    if (!targetIds.has(id) || byId.has(id)) continue;
    const start = m.index;
    let depth = 0;
    let end = start;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end <= start) continue;
    try {
      const obj = JSON.parse(text.slice(start, end));
      if (obj?.id && obj.custom_fields) byId.set(String(obj.id), obj);
    } catch {
      /* skip */
    }
  }
  return byId;
}

fs.mkdirSync(INBOX, { recursive: true });
const merged = new Map();
for (const name of fs.readdirSync(AGENT_TOOLS)) {
  if (!name.endsWith(".txt")) continue;
  const text = fs.readFileSync(path.join(AGENT_TOOLS, name), "utf8");
  for (const [id, task] of extractFromText(text)) merged.set(id, task);
}

let saved = 0;
for (const [id, task] of merged) {
  fs.writeFileSync(path.join(INBOX, `${id}.json`), `${JSON.stringify(task)}\n`);
  saved++;
}
console.log(JSON.stringify({ requested: targetIds.size, saved, missing: [...targetIds].filter((id) => !merged.has(id)) }));
