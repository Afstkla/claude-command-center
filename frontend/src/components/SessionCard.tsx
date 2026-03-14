import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RocketToggle } from './RocketToggle';

interface Props {
  session: {
    id: string;
    name: string;
    cwd: string;
    status: string;
    created_at: string;
    last_activity: string;
    pane_title: string | null;
    rocket_mode: number;
  };
  onKill: () => void;
  onRefresh: () => void;
  onQuickAction: (text: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  running: '#4caf50',
  idle: '#2196f3',
  waiting: '#ff9800',
  starting: '#9e9e9e',
  dead: '#f44336',
};

export function SessionCard({ session, onKill, onRefresh, onQuickAction }: Props) {
  const navigate = useNavigate();
  const color = STATUS_COLORS[session.status] || '#9e9e9e';
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const [confirmKill, setConfirmKill] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(session.name);

  const submitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== session.name) {
      fetch(`/api/sessions/${session.id}/name`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      session.name = trimmed;
    }
    setEditing(false);
  };

  return (
    <div className="session-card" onClick={() => navigate(`/session/${session.id}`)}>
      <div className="session-card-header">
        <span className="status-dot" style={{ backgroundColor: color }} />
        {editing ? (
          <input
            className="rename-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename();
              if (e.key === 'Escape') { setEditName(session.name); setEditing(false); }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <h3 onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>{session.name}</h3>
        )}
      </div>
      {session.pane_title && (
        <p className="session-pane-title">{session.pane_title}</p>
      )}
      <p className="session-cwd">{session.cwd}</p>
      <p className="session-status">{session.status}</p>
      <p className="session-time">
        {new Date(session.last_activity + 'Z').toLocaleString()}
      </p>

      <div className="session-card-actions" onClick={(e) => e.stopPropagation()}>
        <RocketToggle sessionId={session.id} initial={!!session.rocket_mode} />
        <button
          className="refresh-btn"
          onClick={onRefresh}
          title="Restart Claude with --continue"
        >
          &#x21BB;
        </button>
        <button
          className={`kill-btn${confirmKill ? ' kill-btn--confirm' : ''}`}
          onClick={() => {
            if (confirmKill) {
              onKill();
            } else {
              setConfirmKill(true);
              setTimeout(() => setConfirmKill(false), 3000);
            }
          }}
        >
          {confirmKill ? 'Confirm?' : 'Kill'}
        </button>
      </div>

      {session.status === 'waiting' && !showCustomInput && (
        <div className="quick-actions" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onQuickAction('y')}>Yes</button>
          <button onClick={() => onQuickAction('n')}>No</button>
          <button onClick={() => setShowCustomInput(true)}>Reply...</button>
        </div>
      )}

      {showCustomInput && (
        <div className="quick-actions-input" onClick={(e) => e.stopPropagation()}>
          <input
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onQuickAction(customText);
                setCustomText('');
                setShowCustomInput(false);
              }
              if (e.key === 'Escape') setShowCustomInput(false);
            }}
            placeholder="Type a response..."
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
