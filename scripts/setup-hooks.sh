#!/bin/bash
# Sets up Claude Code notification hooks for all sessions (user-scope).
# Adds the permission_prompt hook to ~/.claude/settings.json so you get
# push notifications whenever Claude Code asks for tool approval.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/notify-hook.py"
SETTINGS_FILE="$HOME/.claude/settings.json"

if [[ ! -f "$HOOK_SCRIPT" ]]; then
  echo "Error: notify-hook.py not found at $HOOK_SCRIPT"
  exit 1
fi

# Ensure ~/.claude directory exists
mkdir -p "$HOME/.claude"

# Create or merge into settings.json
if [[ -f "$SETTINGS_FILE" ]]; then
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf-8'));
    if (!config.hooks) config.hooks = {};
    if (!config.hooks.Notification) config.hooks.Notification = [];

    const hookCommand = '$HOOK_SCRIPT';

    // Remove any existing notify-hook entries (both .sh and .py)
    config.hooks.Notification = config.hooks.Notification.filter(
      n => !(n.matcher === 'permission_prompt' &&
             n.hooks?.some(h => h.command.includes('notify-hook')))
    );

    config.hooks.Notification.push({
      matcher: 'permission_prompt',
      hooks: [{ type: 'command', command: hookCommand }],
    });
    console.log('Configured notification hook.');

    fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(config, null, 2) + '\n');
  "
else
  cat > "$SETTINGS_FILE" << EOJSON
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "$HOOK_SCRIPT"
          }
        ]
      }
    ]
  }
}
EOJSON
  echo "Created $SETTINGS_FILE with notification hook."
fi

echo ""
echo "Hook configured: $HOOK_SCRIPT"
echo "All Claude Code sessions will now send push notifications on tool approval prompts."
