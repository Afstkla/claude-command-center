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
import os
import subprocess
import sys
from pathlib import Path
from urllib.request import Request, urlopen

LOG = Path(__file__).resolve().parent.parent / "logs" / "rocket-hook.log"


def log(msg: str):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a") as f:
        f.write(msg + "\n")


def get_cc_session_id() -> str | None:
    """Get the Command Center session ID from the tmux session name."""
    # Try TMUX env var first — if set, we're inside a tmux session
    tmux_env = os.environ.get("TMUX", "")
    log(f"TMUX env: {tmux_env!r}")

    try:
        result = subprocess.run(
            ["tmux", "display-message", "-p", "#S"],
            capture_output=True, text=True, timeout=5,
        )
        name = result.stdout.strip()
        log(f"tmux display-message: {name!r}, stderr: {result.stderr.strip()!r}")
        if name.startswith("cc-"):
            return name.removeprefix("cc-")
    except Exception as e:
        log(f"tmux error: {e}")
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
        log(f"API response for {session_id}: {data}")
        return data.get("rocket_mode", False)
    except Exception as e:
        log(f"API error: {e}")
        return False


def main():
    # Read stdin (hook input)
    try:
        hook_input = json.load(sys.stdin)
    except Exception:
        hook_input = {}
    log(f"--- Hook called. cwd={hook_input.get('cwd', '?')}, tool={hook_input.get('tool_name', '?')}")

    session_id = get_cc_session_id()
    if not session_id:
        log("No cc- session found, exiting")
        return

    log(f"Session ID: {session_id}")

    script_dir = Path(__file__).resolve().parent
    env = load_env(script_dir)
    port = env.get("PORT", "3100")
    token = env.get("NTFY_AUTH_TOKEN", "")

    if not check_rocket_mode(port, session_id, token):
        log("Rocket mode OFF")
        return

    # Never auto-approve AskUserQuestion — the user needs to see and answer it
    tool_name = hook_input.get("tool_name", "")
    if tool_name == "AskUserQuestion":
        log("Rocket mode ON but skipping AskUserQuestion")
        return

    event = hook_input.get("hook_event_name", "PreToolUse")
    log(f"Rocket mode ON — approving ({event})")

    if event == "PermissionRequest":
        json.dump({
            "hookSpecificOutput": {
                "hookEventName": "PermissionRequest",
                "decision": {"behavior": "allow"},
            }
        }, sys.stdout)
    else:
        json.dump({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": "Rocket mode enabled",
            }
        }, sys.stdout)


if __name__ == "__main__":
    main()
