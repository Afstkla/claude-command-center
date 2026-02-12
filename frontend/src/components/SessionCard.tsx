import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  session: {
    id: string;
    name: string;
    cwd: string;
    status: string;
    created_at: string;
    last_activity: string;
  };
  onKill: () => void;
  onQuickAction: (text: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  running: '#4caf50',
  idle: '#2196f3',
  waiting: '#ff9800',
  starting: '#9e9e9e',
  dead: '#f44336',
};

export function SessionCard({ session, onKill, onQuickAction }: Props) {
  const navigate = useNavigate();
  const color = STATUS_COLORS[session.status] || '#9e9e9e';
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState('');

  return (
    <div className="session-card" onClick={() => navigate(`/session/${session.id}`)}>
      <div className="session-card-header">
        <span className="status-dot" style={{ backgroundColor: color }} />
        <h3>{session.name}</h3>
      </div>
      <p className="session-cwd">{session.cwd}</p>
      <p className="session-status">{session.status}</p>
      <p className="session-time">
        {new Date(session.last_activity + 'Z').toLocaleString()}
      </p>
      <button
        className="kill-btn"
        onClick={(e) => {
          e.stopPropagation();
          onKill();
        }}
      >
        Kill
      </button>

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
