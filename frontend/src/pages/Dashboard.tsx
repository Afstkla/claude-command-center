import { useState, useEffect, useCallback } from 'react';
import { SessionCard } from '../components/SessionCard';
import { NewSessionDialog } from '../components/NewSessionDialog';

interface Session {
  id: string;
  name: string;
  cwd: string;
  status: string;
  created_at: string;
  last_activity: string;
}

export function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showNew, setShowNew] = useState(false);

  const fetchSessions = useCallback(async () => {
    const res = await fetch('/api/sessions');
    if (res.ok) setSessions(await res.json());
  }, []);

  useEffect(() => {
    fetchSessions();
    const id = setInterval(fetchSessions, 5000);
    return () => clearInterval(id);
  }, [fetchSessions]);

  async function handleKill(id: string) {
    if (!confirm('Kill this session?')) return;
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    fetchSessions();
  }

  async function handleQuickAction(id: string, text: string) {
    await fetch(`/api/sessions/${id}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    // Backend polls status every 3s — retry a few times to catch the change
    fetchSessions();
    setTimeout(fetchSessions, 1500);
    setTimeout(fetchSessions, 4000);
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Command Center</h1>
        <button onClick={() => setShowNew(true)}>New Session</button>
      </header>

      {sessions.length === 0 && (
        <p className="empty">No sessions. Create one to get started.</p>
      )}

      <div className="session-grid">
        {sessions.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            onKill={() => handleKill(s.id)}
            onQuickAction={(text) => handleQuickAction(s.id, text)}
          />
        ))}
      </div>

      {showNew && (
        <NewSessionDialog
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            fetchSessions();
          }}
        />
      )}
    </div>
  );
}
