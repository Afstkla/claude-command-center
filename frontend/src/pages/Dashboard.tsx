import { useState, useEffect, useCallback, useMemo } from 'react';
import { SessionCard } from '../components/SessionCard';
import { NewSessionDialog } from '../components/NewSessionDialog';

interface Session {
  id: string;
  name: string;
  cwd: string;
  status: string;
  created_at: string;
  last_activity: string;
  worktree_path: string | null;
  repo: string | null;
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

  const { grouped, ungrouped } = useMemo(() => {
    const grouped = new Map<string, Session[]>();
    const ungrouped: Session[] = [];
    for (const s of sessions) {
      if (s.repo) {
        const list = grouped.get(s.repo) || [];
        list.push(s);
        grouped.set(s.repo, list);
      } else {
        ungrouped.push(s);
      }
    }
    return { grouped, ungrouped };
  }, [sessions]);

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

      {ungrouped.length > 0 && (
        <div className="session-grid">
          {ungrouped.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              onKill={() => handleKill(s.id)}
              onQuickAction={(text) => handleQuickAction(s.id, text)}
            />
          ))}
        </div>
      )}

      {[...grouped.entries()].map(([repo, repoSessions]) => (
        <div key={repo} className="repo-group">
          <h2 className="repo-group-header">{repo}</h2>
          <div className="session-grid">
            {repoSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onKill={() => handleKill(s.id)}
                onQuickAction={(text) => handleQuickAction(s.id, text)}
              />
            ))}
          </div>
        </div>
      ))}

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
