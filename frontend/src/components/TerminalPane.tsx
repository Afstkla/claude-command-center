import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

const WS_TIMEOUT = 5000;
const RECONNECT_BASE = 1000;
const RECONNECT_MAX = 30_000;
const HEARTBEAT_TIMEOUT = 25_000;

export interface TerminalPaneHandle {
  sendInput: (data: string) => void;
  refresh: () => void;
}

interface Props {
  sessionId: string;
  onClose?: () => void;
  showClose?: boolean;
}

export const TerminalPane = forwardRef<TerminalPaneHandle, Props>(function TerminalPane({ sessionId, onClose, showClose }, ref) {
  const termRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termInstanceRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useImperativeHandle(ref, () => ({
    sendInput: (data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'data', data }));
      }
    },
    refresh: () => {
      const term = termInstanceRef.current;
      const fit = fitAddonRef.current;
      const ws = wsRef.current;
      if (!term || !fit || !ws || ws.readyState !== WebSocket.OPEN) return;
      fit.fit();
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols + 1, rows: term.rows }));
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    },
  }));

  useEffect(() => {
    if (!termRef.current || !sessionId) return;

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
      const ws = new WebSocket(`${protocol}//${location.host}/ws/terminal/${sessionId}`);
      activeWs = ws;
      wsRef.current = ws;
      let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

      function resetHeartbeat() {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(() => {
          ws.close();
        }, HEARTBEAT_TIMEOUT);
      }

      const fallbackTimer = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
        }
      }, WS_TIMEOUT);

      ws.onopen = () => {
        clearTimeout(fallbackTimer);
        attempt = 0;
        resetHeartbeat();
        term.clear();
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));

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

        const delay = Math.min(RECONNECT_BASE * Math.pow(2, attempt), RECONNECT_MAX);
        const jitter = delay * (0.5 + Math.random() * 0.5);
        reconnectTimer = setTimeout(() => connectWs(attempt + 1), jitter);
      };

      ws.onerror = () => {};
    }

    connectWs();

    // ResizeObserver to refit when pane dimensions change
    const termEl = termRef.current;
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (activeWs?.readyState === WebSocket.OPEN) {
        activeWs.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    });
    resizeObserver.observe(termEl);

    return () => {
      resizeObserver.disconnect();
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (handleResize) window.removeEventListener('resize', handleResize);
      dataDisposable?.dispose();
      activeWs?.close();
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div className="terminal-pane">
      {showClose && (
        <button className="pane-close-btn" onClick={onClose} title="Close pane">&times;</button>
      )}
      <div ref={termRef} className="terminal-pane-content" />
    </div>
  );
});
