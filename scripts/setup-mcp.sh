#!/bin/bash
# Sets up the Command Center MCP server for all Claude Code sessions.
# Reads config from .env and writes to ~/.claude/settings.json

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
MCP_BUILD="$PROJECT_DIR/mcp-server/build/index.js"

# Read config from .env
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at $ENV_FILE"
  echo "Copy .env.example to .env and fill in your values first."
  exit 1
fi

PORT=$(grep '^PORT=' "$ENV_FILE" | cut -d= -f2)
BASE_URL=$(grep '^BASE_URL=' "$ENV_FILE" | cut -d= -f2)
NTFY_URL=$(grep '^NTFY_URL=' "$ENV_FILE" | cut -d= -f2)
NTFY_TOPIC=$(grep '^NTFY_TOPIC=' "$ENV_FILE" | cut -d= -f2)
NTFY_AUTH_TOKEN=$(grep '^NTFY_AUTH_TOKEN=' "$ENV_FILE" | cut -d= -f2)
PORT="${PORT:-3100}"

if [[ -z "$BASE_URL" ]]; then
  echo "Warning: BASE_URL not set in .env — ask_user won't work."
fi

# Build MCP server if needed
if [[ ! -f "$MCP_BUILD" ]]; then
  echo "Building MCP server..."
  cd "$PROJECT_DIR/mcp-server" && npm install && npm run build
fi

# Claude Code CLI uses ~/.claude/settings.json for MCP servers
SETTINGS_FILE="$HOME/.claude/settings.json"
mkdir -p "$(dirname "$SETTINGS_FILE")"

# Create or update settings.json
if [[ -f "$SETTINGS_FILE" ]]; then
  # Use node to merge the MCP server config into existing settings
  node -e "
    const fs = require('fs');
    const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf-8'));
    if (!settings.mcpServers) settings.mcpServers = {};
    settings.mcpServers['command-center'] = {
      command: 'node',
      args: ['$MCP_BUILD'],
      env: {
        CC_BASE_URL: '$BASE_URL',
        CC_NTFY_URL: '${NTFY_URL:-https://ntfy.sh}',
        CC_NTFY_TOPIC: '$NTFY_TOPIC',
        CC_AUTH_TOKEN: '$NTFY_AUTH_TOKEN',
      },
    };
    fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2) + '\n');
  "
else
  node -e "
    const fs = require('fs');
    const settings = {
      mcpServers: {
        'command-center': {
          command: 'node',
          args: ['$MCP_BUILD'],
          env: {
            CC_BASE_URL: '$BASE_URL',
            CC_NTFY_URL: '${NTFY_URL:-https://ntfy.sh}',
            CC_NTFY_TOPIC: '$NTFY_TOPIC',
            CC_AUTH_TOKEN: '$NTFY_AUTH_TOKEN',
          },
        },
      },
    };
    fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2) + '\n');
  "
fi

echo "MCP server configured in $SETTINGS_FILE"
echo ""
echo "New Claude Code sessions will now have notify_user and ask_user tools."
echo "Existing sessions need to be restarted to pick up the change."
