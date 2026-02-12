#!/bin/bash
# Claude Code Notification hook — sends tool permission details to Command Center
# Configure in .claude/settings.json under hooks.Notification
#
# The Notification hook receives: message, title, notification_type,
# transcript_path, session_id, cwd, permission_mode — but NOT tool details.
# We extract tool_name/tool_input from the transcript file.

# Read hook JSON from stdin
INPUT=$(cat)

# Get the tmux session name (e.g. cc-abc123)
TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null)
if [[ -z "$TMUX_SESSION" || "$TMUX_SESSION" != cc-* ]]; then
  exit 0  # Not running inside a Command Center tmux session
fi

# Strip cc- prefix to get our session ID
SESSION_ID="${TMUX_SESSION#cc-}"

# Load config from .env in the project root (same dir as this script's parent)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [[ -f "$ENV_FILE" ]]; then
  PORT=$(grep '^PORT=' "$ENV_FILE" | cut -d= -f2)
  TOKEN=$(grep '^NTFY_AUTH_TOKEN=' "$ENV_FILE" | cut -d= -f2)
fi
PORT="${PORT:-3100}"

# Extract tool info from the transcript (last tool_use block in the last assistant message)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
TOOL_JSON='{}'
if [[ -n "$TRANSCRIPT_PATH" && -f "$TRANSCRIPT_PATH" ]]; then
  TOOL_JSON=$(tail -20 "$TRANSCRIPT_PATH" | python3 -c "
import sys, json
for line in reversed(sys.stdin.readlines()):
    line = line.strip()
    if not line:
        continue
    try:
        entry = json.loads(line)
        content = entry.get('message', {}).get('content', [])
        for block in reversed(content):
            if block.get('type') == 'tool_use':
                json.dump({'tool_name': block['name'], 'tool_input': block.get('input', {})}, sys.stdout)
                sys.exit(0)
    except:
        continue
" 2>/dev/null || echo '{}')
fi

# POST to Command Center
curl -s -X POST "http://localhost:${PORT}/api/sessions/${SESSION_ID}/notify?token=${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$TOOL_JSON" \
  >/dev/null 2>&1 &

exit 0
