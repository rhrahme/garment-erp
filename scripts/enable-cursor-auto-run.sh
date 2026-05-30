#!/usr/bin/env bash
# Enable Cursor Auto-Run + auto-allow ALL tools (Run + Allow buttons).
# IMPORTANT: Quit Cursor completely before running this, or it will overwrite on exit.
set -euo pipefail

DB="$HOME/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
KEY='src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser'
TMP="/tmp/cursor-autorun-patch.json"

if pgrep -x "Cursor" >/dev/null 2>&1; then
  echo "ERROR: Cursor is still running."
  echo "Quit Cursor completely (Cmd+Q), then run this script again."
  exit 1
fi

if [[ ! -f "$DB" ]]; then
  echo "ERROR: Cursor state DB not found at $DB"
  exit 1
fi

cp "$DB" "${DB}.bak.$(date +%Y%m%d-%H%M%S)"

node <<'NODE'
const fs = require('fs');
const { execSync } = require('child_process');

const db = process.env.HOME + '/Library/Application Support/Cursor/User/globalStorage/state.vscdb';
const key = 'src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser';
const tmp = '/tmp/cursor-autorun-patch.json';

const raw = execSync(`sqlite3 "${db}" "SELECT value FROM ItemTable WHERE key='${key}';"`, {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
}).trim();

if (!raw) throw new Error('composerState key not found — open Cursor once and set Auto-Run in UI first');

const data = JSON.parse(raw);
const cs = data.composerState ?? (data.composerState = {});

cs.shouldAutoContinueToolCall = 1;
cs.isAutoApplyEnabled = 1;
cs.useYoloMode = 0;
cs.yoloMcpToolsDisabled = false;
cs.yoloEnableRunEverything = true;
cs.yoloDeleteFileDisabled = false;
cs.yoloOutsideWorkspaceDisabled = false;
cs.doNotShowYoloModeWarningAgain = true;
cs.doNotShowFullYoloModeWarningAgain = true;
cs.autoAcceptWebSearchTool = true;
cs.autoAcceptGenerateImageTool = true;
cs.autoApproveModeTransitions = true;
delete cs.mcpAllowedTools;

for (const mode of cs.modes4 ?? []) {
  if (['agent', 'multitask', 'triage'].includes(mode.id) || mode.autoRun) {
    mode.autoRun = true;
    mode.fullAutoRun = true;
    mode.shouldAutoApplyIfNoEditTool = true;
  }
}

fs.writeFileSync(tmp, JSON.stringify(data));
execSync(`sqlite3 "${db}" "UPDATE ItemTable SET value=readfile('${tmp}') WHERE key='${key}';"`);

const v = JSON.parse(
  execSync(`sqlite3 "${db}" "SELECT value FROM ItemTable WHERE key='${key}';"`, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  }).trim()
).composerState;

console.log('Auto-Run enabled:');
console.log('  yoloEnableRunEverything:', v.yoloEnableRunEverything);
console.log('  agent.fullAutoRun:', v.modes4?.find((m) => m.id === 'agent')?.fullAutoRun);
console.log('  mcpAllowedTools:', v.mcpAllowedTools ?? '(none — all MCP auto-allowed)');
NODE

echo ""
echo "Done. Reopen Cursor and confirm: Settings → Agents → Auto-Run → Run everything"
