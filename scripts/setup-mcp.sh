#!/bin/bash
# Sets up the Command Center MCP server for all Claude Code sessions.
# Reads config from .env and writes to ~/.claude.json (user-scope MCP config)

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

BASE_URL=$(grep '^BASE_URL=' "$ENV_FILE" | cut -d= -f2)
NTFY_URL=$(grep '^NTFY_URL=' "$ENV_FILE" | cut -d= -f2)
NTFY_TOPIC=$(grep '^NTFY_TOPIC=' "$ENV_FILE" | cut -d= -f2)
NTFY_AUTH_TOKEN=$(grep '^NTFY_AUTH_TOKEN=' "$ENV_FILE" | cut -d= -f2)

if [[ -z "$BASE_URL" ]]; then
  echo "Warning: BASE_URL not set in .env — ask_user won't work."
fi

# Build MCP server if needed
if [[ ! -f "$MCP_BUILD" ]]; then
  echo "Building MCP server..."
  cd "$PROJECT_DIR/mcp-server" && npm install && npm run build
fi

# Claude Code uses ~/.claude.json for user-scope MCP servers
CLAUDE_JSON="$HOME/.claude.json"

if [[ -f "$CLAUDE_JSON" ]]; then
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$CLAUDE_JSON', 'utf-8'));
    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers['command-center'] = {
      type: 'stdio',
      command: 'node',
      args: ['$MCP_BUILD'],
      env: {
        CC_BASE_URL: '$BASE_URL',
        CC_NTFY_URL: '${NTFY_URL:-https://ntfy.sh}',
        CC_NTFY_TOPIC: '$NTFY_TOPIC',
        CC_AUTH_TOKEN: '$NTFY_AUTH_TOKEN',
      },
    };
    fs.writeFileSync('$CLAUDE_JSON', JSON.stringify(config, null, 2) + '\n');
  "
else
  echo "Error: ~/.claude.json not found. Is Claude Code installed?"
  exit 1
fi

echo "MCP server configured in $CLAUDE_JSON"
echo ""
echo "New Claude Code sessions will now have notify_user and ask_user tools."
echo "Existing sessions need to be restarted to pick up the change."
