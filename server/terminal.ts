import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import type { Server } from 'http';
import type { Request, Response } from 'express';
import { verifyWsAuth } from './auth.js';
import { getSession } from './db.js';

const TMUX_PREFIX = 'cc-';

interface TerminalMessage {
  type: 'data' | 'resize';
  data?: string;
  cols?: number;
  rows?: number;
}

// Shared pty instances — keyed by session ID, so both WS and HTTP can use the same pty
const activePtys = new Map<string, pty.IPty>();

function getOrSpawnPty(sessionId: string, cols = 80, rows = 24): pty.IPty | null {
  if (activePtys.has(sessionId)) return activePtys.get(sessionId)!;

  const session = getSession(sessionId);
  if (!session || session.status === 'dead') return null;

  const tmuxName = `${TMUX_PREFIX}${sessionId}`;
  console.log('[pty] spawning for', tmuxName, `${cols}x${rows}`);

  const term = pty.spawn('tmux', ['attach-session', '-t', tmuxName], {
    name: 'xterm-256color',
    cols,
    rows,
    env: process.env as Record<string, string>,
  });

  term.onExit(({ exitCode }) => {
    console.log('[pty] exited for', tmuxName, 'code:', exitCode);
    activePtys.delete(sessionId);
  });

  activePtys.set(sessionId, term);
  return term;
}

// --- WebSocket transport ---

export function setupTerminalWs(server: Server) {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
  });

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);

    if (!url.pathname.startsWith('/ws/terminal/')) {
      socket.destroy();
      return;
    }

    const authed = await verifyWsAuth(req.headers.cookie);
    if (!authed) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const sessionId = url.pathname.split('/').pop()!;
      console.log('[ws] connected, session:', sessionId);
      handleWsConnection(ws, sessionId);
    });
  });
}

function handleWsConnection(ws: WebSocket, sessionId: string) {
  const term = getOrSpawnPty(sessionId);
  if (!term) {
    ws.close(4004, 'Session not found');
    return;
  }

  let bytesSent = 0;
  const onData = (data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      bytesSent += data.length;
      ws.send(data);
    }
  };

  term.onData(onData);

  term.onExit(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'Terminal exited');
    }
  });

  ws.on('message', (raw) => {
    try {
      const msg: TerminalMessage = JSON.parse(raw.toString());
      if (msg.type === 'data' && msg.data) {
        term.write(msg.data);
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        term.resize(msg.cols, msg.rows);
      }
    } catch {
      term.write(raw.toString());
    }
  });

  ws.on('close', () => {
    console.log('[ws] disconnected, sent', bytesSent, 'bytes');
    // Don't kill the pty — it's shared and might be used by SSE
  });
}

// --- SSE transport (HTTP fallback for bad networks) ---

export function handleTerminalSSE(req: Request, res: Response) {
  const sessionId = req.params.id;
  const cols = parseInt(req.query.cols as string) || 80;
  const rows = parseInt(req.query.rows as string) || 24;

  const term = getOrSpawnPty(sessionId, cols, rows);
  if (!term) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering if proxied
  });
  res.flushHeaders();

  const onData = (data: string) => {
    // SSE format: base64-encode binary terminal data
    const encoded = Buffer.from(data).toString('base64');
    res.write(`data: ${encoded}\n\n`);
  };

  term.onData(onData);

  term.onExit(() => {
    res.write('event: exit\ndata: closed\n\n');
    res.end();
  });

  req.on('close', () => {
    console.log('[sse] client disconnected for', sessionId);
  });
}

export function handleTerminalInput(req: Request, res: Response) {
  const sessionId = req.params.id;
  const term = activePtys.get(sessionId);
  if (!term) {
    res.status(404).json({ error: 'No active terminal' });
    return;
  }

  const { data, cols, rows } = req.body;
  if (data) term.write(data);
  if (cols && rows) term.resize(cols, rows);

  res.json({ ok: true });
}
