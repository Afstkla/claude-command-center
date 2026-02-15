import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { MobileToolbar } from '../components/MobileToolbar';
import '@xterm/xterm/css/xterm.css';

const WS_TIMEOUT = 5000; // Fallback to SSE after 5s
const RECONNECT_DELAYS = [1000, 2000, 4000]; // Backoff: 1s, 2s, 4s then stop

export function Terminal() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const termRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState('Connecting...');

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'data', data }));
    }
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
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));

        // Force tmux to repaint by briefly toggling the size
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols + 1, rows: term.rows }));
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
          }
        }, 100);

        ws.onmessage = (e) => {
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
        if (disposed) return;

        if (attempt < RECONNECT_DELAYS.length) {
          const delay = RECONNECT_DELAYS[attempt];
          setStatus(`Reconnecting in ${delay / 1000}s...`);
          reconnectTimer = setTimeout(() => connectWs(attempt + 1), delay);
        } else {
          term.write('\r\n\x1b[31m[Connection lost]\x1b[0m\r\n');
          setStatus('Disconnected');
        }
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
        <span>Session: {id}</span>
        {status && <span style={{ color: '#ff9800', marginLeft: 'auto' }}>{status}</span>}
      </div>
      <div ref={termRef} className="terminal-container" />
      <MobileToolbar onSend={sendInput} />
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
