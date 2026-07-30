import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MobileToolbar } from '../components/MobileToolbar';
import { RocketToggle } from '../components/RocketToggle';
import { TerminalPane, type TerminalPaneHandle } from '../components/TerminalPane';
import '@xterm/xterm/css/xterm.css';

const STATUS_COLORS: Record<string, string> = {
  running: '#4caf50',
  idle: '#2196f3',
  waiting: '#ff9800',
  starting: '#9e9e9e',
  dead: '#f44336',
};

export function Terminal() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sessionName, setSessionName] = useState('');
  const [rocketMode, setRocketMode] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; name: string; status: string; last_activity: string }[]>([]);
  const [panes, setPanes] = useState<string[]>([]);
  const [showPanePicker, setShowPanePicker] = useState(false);
  const [splitDirection, setSplitDirection] = useState<'horizontal' | 'vertical' | 'grid'>('horizontal');
  const primaryPaneRef = useRef<TerminalPaneHandle>(null);

  // Initialize panes with the primary session
  useEffect(() => {
    if (id) setPanes((prev) => prev.length === 0 ? [id] : prev.map((p, i) => i === 0 ? id : p));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/sessions/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((s) => {
        if (s?.name) setSessionName(s.name);
        if (s) setRocketMode(!!s.rocket_mode);
      });
  }, [id]);

  useEffect(() => {
    const load = () => fetch('/api/sessions').then((r) => {
      if (r.status === 401) { navigate('/login'); return []; }
      return r.ok ? r.json() : [];
    }).then(setSessions);
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.title = sessionName ? `${sessionName} | Command Center` : 'Command Center';
    return () => { document.title = 'Command Center'; };
  }, [sessionName]);

  const addPane = useCallback((sessionId: string) => {
    setPanes((prev) => [...prev, sessionId]);
    setShowPanePicker(false);
  }, []);

  const removePane = useCallback((index: number) => {
    setPanes((prev) => {
      if (prev.length <= 1) return prev; // Don't remove last pane
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Sessions available to add (not dead, not already in a pane)
  const availableSessions = sessions
    .filter((s) => s.status !== 'dead' && !panes.includes(s.id))
    .sort((a, b) => b.last_activity.localeCompare(a.last_activity));

  // Compute grid layout based on pane count and split direction
  const gridStyle = panes.length <= 1 ? {} : (() => {
    const n = panes.length;
    if (splitDirection === 'horizontal') {
      return { display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: '2px' };
    }
    if (splitDirection === 'vertical') {
      return { display: 'grid', gridTemplateRows: `repeat(${n}, 1fr)`, gap: '2px' };
    }
    // Grid: auto columns, e.g. 2 cols for 3-4 panes, 3 cols for 5-9, etc.
    const cols = Math.ceil(Math.sqrt(n));
    return { display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '2px' };
  })();

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <button onClick={() => navigate('/')}>Back</button>
        <EditableName sessionId={id!} initialName={sessionName} />
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
          {panes.length > 1 && (
            <button
              className="refresh-btn"
              title={`Layout: ${splitDirection}`}
              onClick={() => setSplitDirection((d) =>
                d === 'horizontal' ? 'vertical' : d === 'vertical' ? 'grid' : 'horizontal'
              )}
            >
              {splitDirection === 'horizontal' ? '\u2503' : splitDirection === 'vertical' ? '\u2501' : '\u25A6'}
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button
              className="refresh-btn"
              title="Add split pane"
              onClick={() => setShowPanePicker(!showPanePicker)}
            >
              +
            </button>
            {showPanePicker && (
              <div className="pane-picker">
                {availableSessions.length === 0 ? (
                  <div className="pane-picker-empty">No sessions available</div>
                ) : (
                  availableSessions.map((s) => (
                    <button
                      key={s.id}
                      className="pane-picker-item"
                      onClick={() => addPane(s.id)}
                    >
                      <span className="tab-dot" style={{ backgroundColor: STATUS_COLORS[s.status] || '#9e9e9e' }} />
                      {s.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </span>
      </div>
      <div className="session-tabs">
        {[...sessions].filter((s) => s.status !== 'dead').sort((a, b) => {
          if (a.id === id) return -1;
          if (b.id === id) return 1;
          return b.last_activity.localeCompare(a.last_activity);
        }).map((s) => (
          <button
            key={s.id}
            className={`session-tab${s.id === id ? ' session-tab--active' : ''}`}
            onClick={() => navigate(`/session/${s.id}`)}
          >
            <span className="tab-dot" style={{ backgroundColor: STATUS_COLORS[s.status] || '#9e9e9e' }} />
            {s.name}
          </button>
        ))}
      </div>
      <div className="terminal-panes" style={gridStyle}>
        {panes.map((paneId, i) => (
          <TerminalPane
            key={paneId}
            ref={i === 0 ? primaryPaneRef : undefined}
            sessionId={paneId}
            showClose={panes.length > 1}
            onClose={() => removePane(i)}
          />
        ))}
      </div>
      <MobileToolbar
        onSend={(data) => primaryPaneRef.current?.sendInput(data)}
        onRefresh={() => primaryPaneRef.current?.refresh()}
      />
    </div>
  );
}

function EditableName({ sessionId, initialName }: { sessionId: string; initialName: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);

  useEffect(() => { setName(initialName); }, [initialName]);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== initialName) {
      fetch(`/api/sessions/${sessionId}/name`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className="rename-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') { setName(initialName); setEditing(false); }
        }}
        autoFocus
      />
    );
  }

  return (
    <span onDoubleClick={() => setEditing(true)} style={{ cursor: 'pointer' }}>
      {name ? `${name} (${sessionId})` : sessionId}
    </span>
  );
}
