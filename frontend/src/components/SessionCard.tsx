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
}

const STATUS_COLORS: Record<string, string> = {
  running: '#4caf50',
  idle: '#2196f3',
  waiting: '#ff9800',
  starting: '#9e9e9e',
  dead: '#f44336',
};

export function SessionCard({ session, onKill }: Props) {
  const navigate = useNavigate();
  const color = STATUS_COLORS[session.status] || '#9e9e9e';

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
    </div>
  );
}
