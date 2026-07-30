import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  pane_title: string | null;
  rocket_mode: number;
}

export function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [offline, setOffline] = useState(false);
  const failCount = useRef(0);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions', { signal: AbortSignal.timeout(10_000) });
      if (res.status === 401) { navigate('/login'); return; }
      if (res.ok) {
        setSessions(await res.json());
        failCount.current = 0;
        setOffline(false);
      } else {
        failCount.current++;
      }
    } catch {
      failCount.current++;
    }
    if (failCount.current >= 2) setOffline(true);
  }, []);

  useEffect(() => {
    fetchSessions();
    const id = setInterval(fetchSessions, 5000);
    // Refetch immediately when coming back online or foregrounding
    const onOnline = () => fetchSessions();
    const onVisible = () => { if (document.visibilityState === 'visible') fetchSessions(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchSessions]);

  async function handleKill(id: string) {
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    fetchSessions();
  }

  async function handleRefresh(id: string) {
    await fetch(`/api/sessions/${id}/refresh`, { method: 'POST' });
  }

  const { sections, dead } = useMemo(() => {
    const alive: Session[] = [];
    const dead: Session[] = [];
    for (const s of sessions) (s.status === 'dead' ? dead : alive).push(s);

    const repoGroups = new Map<string, Session[]>();
    const other: Session[] = [];
    for (const s of alive) {
      if (s.repo) {
        const list = repoGroups.get(s.repo) || [];
        list.push(s);
        repoGroups.set(s.repo, list);
      } else {
        other.push(s);
      }
    }

    const sections: { key: string; label: string; sessions: Session[] }[] = [];
    if (other.length) sections.push({ key: 'other', label: 'Other', sessions: other });
    for (const [repo, sess] of repoGroups) sections.push({ key: `repo:${repo}`, label: repo, sessions: sess });
    return { sections, dead };
  }, [sessions]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('dashboard-collapsed') || '{}'); }
    catch { return {}; }
  });

  const isCollapsed = (key: string) => !!collapsed[key];

  const toggleSection = (key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('dashboard-collapsed', JSON.stringify(next));
      return next;
    });
  };

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
      {offline && (
        <div style={{ background: '#b71c1c', color: '#fff', textAlign: 'center', padding: '8px', fontSize: '14px' }}>
          Connection lost — retrying...
        </div>
      )}
      <header className="dashboard-header">
        <h1>Command Center</h1>
        <button onClick={() => setShowNew(true)}>New Session</button>
      </header>

      {sessions.length === 0 && (
        <p className="empty">No sessions. Create one to get started.</p>
      )}

      {sections.map((sec) => {
        const collapsed = isCollapsed(sec.key);
        return (
          <div key={sec.key} className="repo-group">
            <h2 className="repo-group-header repo-group-header--toggle" onClick={() => toggleSection(sec.key)}>
              <span className="group-toggle">{collapsed ? '▸' : '▾'}</span>
              {sec.label} <span className="group-count">({sec.sessions.length})</span>
            </h2>
            {!collapsed && (
              <div className="session-grid">
                {sec.sessions.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    onKill={() => handleKill(s.id)}
                    onRefresh={() => handleRefresh(s.id)}
                    onQuickAction={(text) => handleQuickAction(s.id, text)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {dead.length > 0 && (
        <details className="dead-sessions">
          <summary>{dead.length} dead session{dead.length === 1 ? '' : 's'}</summary>
          <div className="session-grid">
            {dead.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onKill={() => handleKill(s.id)}
                onRefresh={() => handleRefresh(s.id)}
                onQuickAction={(text) => handleQuickAction(s.id, text)}
              />
            ))}
          </div>
        </details>
      )}

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
