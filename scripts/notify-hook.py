#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///
"""Claude Code notification hook — sends tool permission details to Command Center.

Configure in ~/.claude/settings.json under hooks.Notification.

The hook receives JSON on stdin with: message, title, notification_type,
transcript_path, session_id, cwd, permission_mode — but NOT tool details.
We extract tool_name/tool_input from the transcript file.
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


def extract_tool_info(transcript_path: str) -> dict:
    """Extract the last tool_use block from the transcript file."""
    try:
        with open(transcript_path) as f:
            lines = f.readlines()
    except Exception:
        return {}

    # Search last 50 lines in reverse for a tool_use block
    for line in reversed(lines[-50:]):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            content = entry.get("message", {}).get("content", [])
            for block in reversed(content):
                if block.get("type") == "tool_use":
                    return {
                        "tool_name": block["name"],
                        "tool_input": block.get("input", {}),
                    }
        except (json.JSONDecodeError, KeyError, TypeError):
            continue

    return {}


def notify(port: str, session_id: str, token: str, tool_info: dict):
    """POST tool info to the Command Center notify endpoint."""
    url = f"http://localhost:{port}/api/sessions/{session_id}/notify?token={token}"
    data = json.dumps(tool_info).encode()
    req = Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        urlopen(req, timeout=5)
    except Exception:
        pass


def main():
    tmux_name = get_tmux_session()
    if not tmux_name:
        return

    session_id = tmux_name.removeprefix("cc-")
    hook_input = json.loads(sys.stdin.read())

    script_dir = Path(__file__).resolve().parent
    env = load_env(script_dir)
    port = env.get("PORT", "3100")
    token = env.get("NTFY_AUTH_TOKEN", "")

    transcript_path = hook_input.get("transcript_path", "")
    tool_info = extract_tool_info(transcript_path) if transcript_path else {}

    notify(port, session_id, token, tool_info)


if __name__ == "__main__":
    main()
