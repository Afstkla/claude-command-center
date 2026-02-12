#!/bin/bash
# Claude Code Notification hook — sends tool permission details to Command Center
# Configure in .claude/settings.json under hooks.Notification

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

# Extract tool info from the hook JSON
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')

# POST to Command Center
curl -s -X POST "http://localhost:${PORT}/api/sessions/${SESSION_ID}/notify?token=${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"tool_name\":\"$TOOL_NAME\",\"tool_input\":$TOOL_INPUT}" \
  >/dev/null 2>&1 &

exit 0
