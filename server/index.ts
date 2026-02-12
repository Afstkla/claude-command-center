import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { readdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { login, authMiddleware, COOKIE_NAME, MAX_AGE_HOURS } from './auth.js';
import { createSession, listSessions, killSession, getSession } from './sessions.js';
import { syncSessionsWithTmux } from './sessions.js';
import { setupTerminalWs, handleTerminalSSE, handleTerminalInput } from './terminal.js';
import { startStatusPolling } from './status.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3100', 10);

const app = express();
app.use(express.json());
app.use(cookieParser());

// Auth middleware for API routes
app.use('/api', authMiddleware);

// --- Auth ---

app.post('/api/auth/login', async (req, res) => {
  const { passphrase } = req.body;
  const token = await login(passphrase);

  if (!token) {
    res.status(401).json({ error: 'Invalid passphrase' });
    return;
  }

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: MAX_AGE_HOURS * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/auth/check', (_req, res) => {
  res.json({ ok: true });
});

// --- Sessions ---

app.get('/api/sessions', (_req, res) => {
  res.json(listSessions());
});

app.get('/api/sessions/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

app.post('/api/sessions', (req, res) => {
  const { name, cwd, command } = req.body;

  if (!name || !cwd) {
    res.status(400).json({ error: 'name and cwd are required' });
    return;
  }

  try {
    const session = createSession(name, cwd, command);
    res.status(201).json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', (req, res) => {
  const success = killSession(req.params.id);
  if (!success) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ ok: true });
});

// --- Directory browser ---

app.get('/api/browse', (req, res) => {
  const rawPath = (req.query.path as string) || '~';
  const resolved = rawPath.startsWith('~')
    ? join(homedir(), rawPath.slice(1))
    : resolve(rawPath);

  try {
    const entries = readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();

    res.json({ path: resolved, dirs });
  } catch {
    res.json({ path: resolved, dirs: [] });
  }
});

// --- Terminal SSE fallback (for slow networks where WS upgrade stalls) ---

app.get('/api/terminal/:id/stream', handleTerminalSSE);
app.post('/api/terminal/:id/input', handleTerminalInput);

// --- Static files (production) ---

const frontendDist = join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (_req, res, next) => {
  // Only serve index.html for non-API routes
  if (_req.path.startsWith('/api') || _req.path.startsWith('/ws')) {
    return next();
  }
  res.sendFile(join(frontendDist, 'index.html'), (err) => {
    if (err) next();
  });
});

// --- Start ---

const server = createServer(app);
setupTerminalWs(server);

// Sync existing tmux sessions on startup
syncSessionsWithTmux();
startStatusPolling();

server.listen(PORT, () => {
  console.log(`Command Center running on http://localhost:${PORT}`);
});
