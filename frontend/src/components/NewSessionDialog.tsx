import { useState, useEffect, useCallback, type FormEvent } from 'react';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function NewSessionDialog({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [cwd, setCwd] = useState('~');
  const [command, setCommand] = useState('claude');
  const [error, setError] = useState('');
  const [dirs, setDirs] = useState<string[]>([]);
  const [resolvedPath, setResolvedPath] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);

  const browse = useCallback(async (path: string) => {
    try {
      const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setDirs(data.dirs);
        setResolvedPath(data.path);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    browse(cwd);
  }, [cwd, browse]);

  function navigateTo(dir: string) {
    const newPath = resolvedPath + '/' + dir;
    setCwd(newPath);
    setShowBrowser(true);
  }

  function navigateUp() {
    const parent = resolvedPath.replace(/\/[^/]+\/?$/, '') || '/';
    setCwd(parent);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        cwd,
        command: command || undefined,
      }),
    });

    if (res.ok) {
      onCreated();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to create session');
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <form
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2>New Session</h2>

        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-project"
            required
            autoFocus
          />
        </label>

        <label>
          Working Directory
          <div className="dir-input-row">
            <input
              value={cwd}
              onChange={(e) => {
                setCwd(e.target.value);
                setShowBrowser(true);
              }}
              onFocus={() => setShowBrowser(true)}
              placeholder="/path/to/project"
              required
            />
            <button
              type="button"
              className="browse-btn"
              onClick={() => setShowBrowser(!showBrowser)}
            >
              {showBrowser ? 'Hide' : 'Browse'}
            </button>
          </div>
        </label>

        {showBrowser && (
          <div className="dir-browser">
            <div className="dir-resolved">
              {resolvedPath}
            </div>
            <div className="dir-list">
              <div className="dir-entry" onClick={navigateUp}>..</div>
              {dirs.map((d) => (
                <div key={d} className="dir-entry" onClick={() => navigateTo(d)}>
                  {d}/
                </div>
              ))}
              {dirs.length === 0 && (
                <div className="dir-empty">No subdirectories</div>
              )}
            </div>
          </div>
        )}

        <label>
          Command
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="claude"
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">Create</button>
        </div>
      </form>
    </div>
  );
}
