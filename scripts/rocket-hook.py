#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///
"""Claude Code PreToolUse hook — auto-approves tool calls when rocket mode is on.

Registered in ~/.claude/settings.json under hooks.PreToolUse.
Checks the Command Center API to see if the current session has rocket mode enabled.
If so, outputs {"hookSpecificOutput": {"permissionDecision": "allow"}} to auto-approve.
"""

import json
import subprocess
import sys
from pathlib import Path
from urllib.request import Request, urlopen


def get_tmux_session() -> str | None:
    """Get the current tmux session name, or None if not in a cc- session."""
    try:
        result = subprocess.run(
            ["tmux", "display-message", "-p", "#S"],
            capture_output=True, text=True, timeout=5,
        )
        name = result.stdout.strip()
        if name.startswith("cc-"):
            return name
    except Exception:
        pass
    return None


def load_env(script_dir: Path) -> dict[str, str]:
    """Load key=value pairs from .env file."""
    env_file = script_dir.parent / ".env"
    env = {}
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
    return env


def check_rocket_mode(port: str, session_id: str, token: str) -> bool:
    """Check if rocket mode is enabled for this session."""
    url = f"http://localhost:{port}/api/sessions/{session_id}/rocket?token={token}"
    try:
        req = Request(url, method="GET")
        resp = urlopen(req, timeout=3)
        data = json.loads(resp.read())
        return data.get("rocket_mode", False)
    except Exception:
        return False


def main():
    tmux_name = get_tmux_session()
    if not tmux_name:
        return

    session_id = tmux_name.removeprefix("cc-")

    script_dir = Path(__file__).resolve().parent
    env = load_env(script_dir)
    port = env.get("PORT", "3100")
    token = env.get("NTFY_AUTH_TOKEN", "")

    if check_rocket_mode(port, session_id, token):
        json.dump({
            "hookSpecificOutput": {
                "permissionDecision": "allow",
                "permissionDecisionReason": "Rocket mode enabled",
            }
        }, sys.stdout)


if __name__ == "__main__":
    main()
