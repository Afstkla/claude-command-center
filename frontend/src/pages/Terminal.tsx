import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

const WS_TIMEOUT = 5000; // Fallback to SSE after 5s

export function Terminal() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const termRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Connecting...');

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

    let cleanup: (() => void) | null = null;
    let wsConnected = false;

    // --- Try WebSocket first ---
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws/terminal/${id}`);

    ws.onopen = () => {
      wsConnected = true;
      setStatus('');
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));

      ws.onmessage = (e) => {
        if (e.data instanceof Blob) {
          e.data.text().then((text) => term.write(text));
        } else {
          term.write(e.data);
        }
      };

      ws.onclose = () => {
        term.write('\r\n\x1b[31m[Connection closed]\x1b[0m\r\n');
        setStatus('Disconnected');
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }));
        }
      });

      const handleResize = () => {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      };
      window.addEventListener('resize', handleResize);
      cleanup = () => {
        window.removeEventListener('resize', handleResize);
        ws.close();
      };
    };

    // --- Fallback to SSE after timeout ---
    const fallbackTimer = setTimeout(() => {
      if (wsConnected) return;
      ws.close();
      setStatus('WS slow, using HTTP fallback...');
      startSSE(id, term, fitAddon, setStatus, (fn) => { cleanup = fn; });
    }, WS_TIMEOUT);

    return () => {
      clearTimeout(fallbackTimer);
      cleanup?.();
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
    </div>
  );
}

function startSSE(
  id: string,
  term: XTerm,
  fitAddon: FitAddon,
  setStatus: (s: string) => void,
  setCleanup: (fn: () => void) => void,
) {
  const cols = term.cols;
  const rows = term.rows;
  const evtSource = new EventSource(`/api/terminal/${id}/stream?cols=${cols}&rows=${rows}`);

  evtSource.onopen = () => {
    setStatus('');
  };

  evtSource.onmessage = (e) => {
    // Data is base64-encoded
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

  // Input: POST each keystroke
  term.onData((data) => {
    fetch(`/api/terminal/${id}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
  });

  // Resize: POST on window resize
  const handleResize = () => {
    fitAddon.fit();
    fetch(`/api/terminal/${id}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols: term.cols, rows: term.rows }),
    });
  };
  window.addEventListener('resize', handleResize);

  setCleanup(() => {
    window.removeEventListener('resize', handleResize);
    evtSource.close();
  });
}
