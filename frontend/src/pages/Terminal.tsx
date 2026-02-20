import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { MobileToolbar } from '../components/MobileToolbar';
import { RocketToggle } from '../components/RocketToggle';
import '@xterm/xterm/css/xterm.css';

const WS_TIMEOUT = 5000; // Fallback to SSE after 5s
const RECONNECT_BASE = 1000;
const RECONNECT_MAX = 30_000; // Cap at 30s
const HEARTBEAT_TIMEOUT = 25_000; // Expect server ping within 25s (server pings every 15s)

export function Terminal() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const termRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termInstanceRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState('Connecting...');
  const [sessionName, setSessionName] = useState('');
  const [rocketMode, setRocketMode] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/sessions/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((s) => {
        if (s?.name) setSessionName(s.name);
        if (s) setRocketMode(!!s.rocket_mode);
      });
  }, [id]);

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'data', data }));
    }
  }, []);

  const refresh = useCallback(() => {
    const term = termInstanceRef.current;
    const fit = fitAddonRef.current;
    const ws = wsRef.current;
    if (!term || !fit || !ws || ws.readyState !== WebSocket.OPEN) return;

    fit.fit();
    // Toggle size to force tmux full repaint
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols + 1, rows: term.rows }));
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  }, []);

  useEffect(() => {
    if (!termRef.current || !id) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      scrollback: 5000,
      theme: {
        background: '#1a1a2e',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(termRef.current);
    fitAddon.fit();
    termInstanceRef.current = term;
    fitAddonRef.current = fitAddon;

    let disposed = false;
    let activeWs: WebSocket | null = null;
    let handleResize: (() => void) | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let dataDisposable: { dispose(): void } | null = null;

    function connectWs(attempt = 0) {
      if (disposed) return;

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/ws/terminal/${id}`);
      activeWs = ws;
      wsRef.current = ws;
      let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

      function resetHeartbeat() {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(() => {
          console.log('[ws] heartbeat timeout, closing');
          ws.close();
        }, HEARTBEAT_TIMEOUT);
      }

      const fallbackTimer = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          setStatus('WS slow, using HTTP fallback...');
          startSSE(id!, term, fitAddon, setStatus);
        }
      }, WS_TIMEOUT);

      ws.onopen = () => {
        clearTimeout(fallbackTimer);
        setStatus('');
        attempt = 0;
        resetHeartbeat();
        // Clear stale scrollback so reconnect repaints don't accumulate duplicates
        term.clear();
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));

        // Force tmux to repaint by briefly toggling the size
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols + 1, rows: term.rows }));
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
          }
        }, 100);

        ws.onmessage = (e) => {
          resetHeartbeat();
          if (e.data instanceof Blob) {
            e.data.text().then((text) => term.write(text));
          } else {
            term.write(e.data);
          }
        };

        // Clean up previous input handler before adding new one
        dataDisposable?.dispose();
        dataDisposable = term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'data', data }));
          }
        });

        if (!handleResize) {
          handleResize = () => {
            fitAddon.fit();
            if (activeWs?.readyState === WebSocket.OPEN) {
              activeWs.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
            }
          };
          window.addEventListener('resize', handleResize);
        }
      };

      ws.onclose = () => {
        clearTimeout(fallbackTimer);
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        if (disposed) return;

        // Exponential backoff with jitter, capped at RECONNECT_MAX. Never give up.
        const delay = Math.min(RECONNECT_BASE * Math.pow(2, attempt), RECONNECT_MAX);
        const jitter = delay * (0.5 + Math.random() * 0.5);
        setStatus(`Reconnecting in ${Math.round(jitter / 1000)}s...`);
        reconnectTimer = setTimeout(() => connectWs(attempt + 1), jitter);
      };

      ws.onerror = () => {
        // onclose will fire after this, which handles reconnect
      };
    }

    connectWs();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (handleResize) window.removeEventListener('resize', handleResize);
      dataDisposable?.dispose();
      activeWs?.close();
      term.dispose();
    };
  }, [id]);

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <button onClick={() => navigate('/')}>Back</button>
        <span>{sessionName ? `${sessionName} (${id})` : id}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {status && <span style={{ color: '#ff9800' }}>{status}</span>}
          {id && (
            <button
              className="refresh-btn"
              title="Restart Claude with --continue"
              onClick={() => fetch(`/api/sessions/${id}/refresh`, { method: 'POST' })}
            >
              &#x21BB;
            </button>
          )}
          {id && <RocketToggle sessionId={id} initial={rocketMode} />}
        </span>
      </div>
      <div ref={termRef} className="terminal-container" />
      <MobileToolbar onSend={sendInput} onRefresh={refresh} />
    </div>
  );
}

function startSSE(
  id: string,
  term: XTerm,
  fitAddon: FitAddon,
  setStatus: (s: string) => void,
) {
  const cols = term.cols;
  const rows = term.rows;
  const evtSource = new EventSource(`/api/terminal/${id}/stream?cols=${cols}&rows=${rows}`);

  evtSource.onopen = () => {
    setStatus('');
  };

  evtSource.onmessage = (e) => {
    const text = atob(e.data);
    term.write(text);
  };

  evtSource.addEventListener('exit', () => {
    term.write('\r\n\x1b[31m[Session ended]\x1b[0m\r\n');
    setStatus('Session ended');
    evtSource.close();
  });

  evtSource.onerror = () => {
    setStatus('Connection lost, retrying...');
  };

  term.onData((data) => {
    fetch(`/api/terminal/${id}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
  });

  const handleResize = () => {
    fitAddon.fit();
    fetch(`/api/terminal/${id}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols: term.cols, rows: term.rows }),
    });
  };
  window.addEventListener('resize', handleResize);
}
