import { execFileSync } from 'child_process';
import { getAllSessions, updateSessionStatus } from './db.js';

const TMUX_PREFIX = 'cc-';
const POLL_INTERVAL = 3000;

/** Capture the last N lines from a tmux pane */
function capturePaneLines(tmuxName: string, lines = 15): string[] {
  try {
    const output = execFileSync('tmux', ['capture-pane', '-t', tmuxName, '-p'], {
      encoding: 'utf-8',
    });
    return output.trimEnd().split('\n').slice(-lines);
  } catch {
    return [];
  }
}

/** Detect Claude's state from pane content */
function detectStatus(lines: string[]): string {
  if (lines.length === 0) return 'dead';

  const lastLines = lines.join('\n');

  // Claude asking for permission (check first — "reading/writing" in option text can false-positive as running)
  if (/Do you want to proceed\?/i.test(lastLines)) return 'waiting';
  if (/allow|approve|deny|yes.*no/i.test(lastLines)) return 'waiting';

  // Claude waiting for input — prompt character visible
  if (/[❯>]\s*$/.test(lastLines)) return 'idle';

  // Claude actively processing
  if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏●∙]/.test(lastLines)) return 'running';
  if (/thinking|processing|reading|writing/i.test(lastLines)) return 'running';

  // Default to running if we have content
  return 'running';
}

let intervalId: ReturnType<typeof setInterval> | null = null;

/** Start polling tmux sessions for status updates */
export function startStatusPolling() {
  if (intervalId) return;

  intervalId = setInterval(() => {
    const sessions = getAllSessions();
    for (const session of sessions) {
      if (session.status === 'dead') continue;

      const tmuxName = `${TMUX_PREFIX}${session.id}`;
      const lines = capturePaneLines(tmuxName);
      const status = detectStatus(lines);

      if (status !== session.status) {
        updateSessionStatus(session.id, status);
      }
    }
  }, POLL_INTERVAL);
}

export function stopStatusPolling() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
