import { execSync, execFileSync, exec } from 'child_process';
import { basename, dirname, join } from 'path';
import { nanoid } from 'nanoid';
import {
  insertSession,
  getAllSessions,
  getSession,
  updateSessionStatus,
  removeSession,
  setSessionMeta,
  type Session,
} from './db.js';
import { sendInput } from './input.js';

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

interface CreateSessionOpts {
  worktreePath?: string;
  initialPrompt?: string;
  repo?: string;
}

/** Create a new session in tmux. Defaults to `claude` but supports any command. */
export function createSession(
  name: string,
  cwd: string,
  command?: string,
  opts?: CreateSessionOpts,
): Session {
  const id = nanoid(10);
  const tmuxName = tmuxSessionName(id);

  // Default to claude, but allow any TUI command
  const shellCommand = command || 'claude';

  // Strip Claude Code env vars so nested claude sessions can start
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  execFileSync('tmux', [
    'new-session',
    '-d',
    '-s', tmuxName,
    '-c', cwd,
  ], { env });

  // Send the command inside the shell so the tmux session survives if the command exits
  execFileSync('tmux', ['send-keys', '-t', tmuxName, '-l', shellCommand]);
  execFileSync('tmux', ['send-keys', '-t', tmuxName, 'Enter']);

  insertSession(id, name, cwd);
  updateSessionStatus(id, 'running');

  if (opts?.worktreePath || opts?.repo) {
    setSessionMeta(id, opts.worktreePath, opts.repo);
  }

  if (opts?.initialPrompt) {
    setTimeout(() => sendInput(id, opts.initialPrompt!), 5000);
  }

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

  // Clean up git worktree if this was a worktree session
  if (session.worktree_path) {
    try {
      const repoName = basename(dirname(session.worktree_path));
      const mainPath = join(dirname(session.worktree_path), `${repoName}-main`);
      execFileSync('git', ['-C', mainPath, 'worktree', 'remove', '--force', session.worktree_path]);
    } catch (err) {
      console.error(`Failed to remove worktree ${session.worktree_path}:`, err);
    }
  }

  removeSession(id);
  return true;
}

/** Poll a condition every `ms` until it returns true, up to `maxAttempts` times */
function pollUntil(
  check: () => boolean,
  then: () => void,
  ms: number,
  maxAttempts: number,
) {
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(interval);
      console.log('[refresh] polling timed out');
      return;
    }
    try {
      if (check()) {
        clearInterval(interval);
        then();
      }
    } catch (err) {
      // Don't give up on transient errors, just log and retry
      console.log('[refresh] poll error:', err);
    }
  }, ms);
}

function isPaneReady(tmuxName: string): 'dead' | 'prompt' | 'waiting' {
  try {
    const paneState = execSync(
      `tmux list-panes -t ${tmuxName} -F '#{pane_dead}'`,
      { encoding: 'utf-8', timeout: 3000 },
    ).trim();
    if (paneState === '1') return 'dead';

    const output = execSync(
      `tmux capture-pane -t ${tmuxName} -p | tail -3`,
      { encoding: 'utf-8', timeout: 3000 },
    );
    if (/[$%❯]\s*$/.test(output.trim())) return 'prompt';
  } catch { /* ignore */ }
  return 'waiting';
}

function sendContinueCommand(tmuxName: string) {
  execFileSync('tmux', ['send-keys', '-t', tmuxName, '-l', '--', 'claude --continue']);
  execFileSync('tmux', ['send-keys', '-t', tmuxName, 'Enter']);
}

/** Restart Claude Code in an existing tmux session with --continue */
export function refreshSession(id: string): boolean {
  const session = getSession(id);
  if (!session) return false;

  const tmuxName = tmuxSessionName(id);
  if (!tmuxSessionExists(tmuxName)) return false;

  const cwd = session.cwd === '~' ? '' : session.cwd;

  try {
    // Keep the pane alive after Claude exits (for old-style sessions where Claude IS the process)
    execFileSync('tmux', ['set-option', '-t', tmuxName, 'remain-on-exit', 'on']);
    // Ctrl+C to cancel any in-progress operation, then /exit to quit
    execFileSync('tmux', ['send-keys', '-t', tmuxName, 'C-c', '']);
  } catch {
    return false;
  }

  // Step 1: Wait 1s for Ctrl+C to land, then send /exit
  setTimeout(() => {
    try {
      execFileSync('tmux', ['send-keys', '-t', tmuxName, '-l', '--', '/exit']);
      execFileSync('tmux', ['send-keys', '-t', tmuxName, 'Enter']);
    } catch { return; }

    // Step 2: Poll until Claude has exited (pane dead or shell prompt)
    pollUntil(
      () => isPaneReady(tmuxName) !== 'waiting',
      () => {
        const state = isPaneReady(tmuxName);
        console.log('[refresh] Claude exited, pane state:', state);

        if (state === 'dead') {
          // Old-style session: respawn pane with a shell
          // Explicit shell command prevents respawn-pane from re-running the original command
          const shell = process.env.SHELL || '/bin/bash';
          const args = ['respawn-pane', '-k', '-t', tmuxName];
          if (cwd) args.push('-c', cwd);
          args.push(shell);
          execFileSync('tmux', args);
          execFileSync('tmux', ['set-option', '-t', tmuxName, 'remain-on-exit', 'off']);

          // Step 3: Wait for the new shell to be ready, then send claude --continue
          pollUntil(
            () => isPaneReady(tmuxName) === 'prompt',
            () => {
              console.log('[refresh] shell ready, sending claude --continue');
              sendContinueCommand(tmuxName);
            },
            500,
            20, // 10s
          );
        } else {
          // New-style session: already at shell prompt
          execFileSync('tmux', ['set-option', '-t', tmuxName, 'remain-on-exit', 'off']);
          console.log('[refresh] at prompt, sending claude --continue');
          sendContinueCommand(tmuxName);
        }
      },
      1000,
      30, // 30s max wait for Claude to exit (/exit can be slow)
    );
  }, 1000);

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
