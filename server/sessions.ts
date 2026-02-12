import { execSync, execFileSync } from 'child_process';
import { nanoid } from 'nanoid';
import {
  insertSession,
  getAllSessions,
  getSession,
  updateSessionStatus,
  removeSession,
  type Session,
} from './db.js';

const TMUX_PREFIX = 'cc-';

function tmuxSessionName(id: string) {
  return `${TMUX_PREFIX}${id}`;
}

/** Check if a tmux session exists */
function tmuxSessionExists(name: string): boolean {
  try {
    execFileSync('tmux', ['has-session', '-t', name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Create a new session in tmux. Defaults to `claude` but supports any command. */
export function createSession(
  name: string,
  cwd: string,
  command?: string
): Session {
  const id = nanoid(10);
  const tmuxName = tmuxSessionName(id);

  // Default to claude, but allow any TUI command
  const shellCommand = command || 'claude';

  execFileSync('tmux', [
    'new-session',
    '-d',
    '-s', tmuxName,
    '-c', cwd,
    shellCommand,
  ]);

  insertSession(id, name, cwd);
  updateSessionStatus(id, 'running');

  return getSession(id)!;
}

/** List all sessions, syncing tmux state */
export function listSessions(): Session[] {
  const sessions = getAllSessions();

  for (const session of sessions) {
    const exists = tmuxSessionExists(tmuxSessionName(session.id));
    if (!exists && session.status !== 'dead') {
      updateSessionStatus(session.id, 'dead');
      session.status = 'dead';
    }
  }

  return sessions;
}

/** Get a single session by ID */
export { getSession };

/** Kill a tmux session and remove from DB */
export function killSession(id: string): boolean {
  const session = getSession(id);
  if (!session) return false;

  const tmuxName = tmuxSessionName(id);
  if (tmuxSessionExists(tmuxName)) {
    try {
      // Send Ctrl+C first to gracefully stop Claude
      execFileSync('tmux', ['send-keys', '-t', tmuxName, 'C-c', '']);
      // Small delay then kill
      execFileSync('tmux', ['kill-session', '-t', tmuxName]);
    } catch {
      // Session may already be gone
    }
  }

  removeSession(id);
  return true;
}

/** Sync DB with tmux on startup — mark dead sessions, adopt orphans */
export function syncSessionsWithTmux() {
  const sessions = getAllSessions();

  // Mark sessions whose tmux is gone as dead
  for (const session of sessions) {
    if (!tmuxSessionExists(tmuxSessionName(session.id))) {
      updateSessionStatus(session.id, 'dead');
    } else if (session.status === 'dead' || session.status === 'starting') {
      updateSessionStatus(session.id, 'running');
    }
  }

  // Find orphaned tmux sessions (our prefix but not in DB)
  try {
    const output = execSync('tmux list-sessions -F "#{session_name}"', {
      encoding: 'utf-8',
    });
    const tmuxSessions = output.trim().split('\n').filter(Boolean);

    for (const name of tmuxSessions) {
      if (!name.startsWith(TMUX_PREFIX)) continue;
      const id = name.slice(TMUX_PREFIX.length);
      if (!getSession(id)) {
        // Orphaned tmux session — add it back to DB
        insertSession(id, `recovered-${id}`, '~');
        updateSessionStatus(id, 'running');
      }
    }
  } catch {
    // No tmux server running — that's fine
  }
}
