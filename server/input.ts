import { execFileSync } from 'child_process';
import { getSession } from './db.js';

const TMUX_PREFIX = 'cc-';

/** Send input to a tmux session via send-keys (works without a spawned pty) */
export function sendInput(sessionId: string, text: string): boolean {
  const session = getSession(sessionId);
  if (!session || session.status === 'dead') return false;

  const tmuxName = `${TMUX_PREFIX}${sessionId}`;
  try {
    execFileSync('tmux', ['send-keys', '-t', tmuxName, '-l', text]);
    execFileSync('tmux', ['send-keys', '-t', tmuxName, 'Enter']);
    return true;
  } catch {
    return false;
  }
}
