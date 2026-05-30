#!/usr/bin/env bash
# Schedule Drapers API follow-up reminder via macOS LaunchAgent (one-shot).
# Usage: ./scripts/schedule-drapers-api-reminder.sh [days_from_now]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DAYS="${1:-7}"
SEND_SCRIPT="$ROOT/scripts/send-drapers-api-reminder.mjs"
LABEL="com.hagan.garment-erp.drapers-api-reminder"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG="$ROOT/drapers-api-reminder.log"

if [[ ! -f "$SEND_SCRIPT" ]]; then
  echo "Missing $SEND_SCRIPT" >&2
  exit 1
fi

# Follow-up date at 9:00 AM local
if date -v+"${DAYS}d" +%Y-%m-%d >/dev/null 2>&1; then
  FOLLOW_UP_DATE="$(date -v+"${DAYS}d" +%Y-%m-%d)"
  MONTH="$(date -v+"${DAYS}d" +%-m)"
  DAY="$(date -v+"${DAYS}d" +%-d)"
else
  FOLLOW_UP_DATE="$(date -d "+${DAYS} days" +%Y-%m-%d)"
  MONTH="$(date -d "+${DAYS} days" +%-m)"
  DAY="$(date -d "+${DAYS} days" +%-d)"
fi

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>${SEND_SCRIPT}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Month</key>
    <integer>${MONTH}</integer>
    <key>Day</key>
    <integer>${DAY}</integer>
    <key>Hour</key>
    <integer>9</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LOG}</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

cat > "$ROOT/drapers-api-reminder.local.json" <<EOF
{
  "topic": "Drapers API integration follow-up",
  "requested_on": "$(date +%Y-%m-%d)",
  "follow_up_on": "${FOLLOW_UP_DATE}",
  "follow_up_at": "${FOLLOW_UP_DATE}T09:00:00",
  "scheduled_at": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "recipients": ["rhrahme@gmail.com", "info@hagan.pro"],
  "notes": "User requested Drapers API integration; follow up with Jessica/Federico in ${DAYS} days."
}
EOF

/usr/bin/env node "$SEND_SCRIPT" --confirm-scheduled

echo "✓ Scheduled Drapers API reminder for ${FOLLOW_UP_DATE} at 9:00 AM"
echo "  LaunchAgent: $PLIST"
echo "  Log: $LOG"
