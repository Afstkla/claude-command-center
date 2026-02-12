import { useState, useEffect, useCallback } from 'react';

interface Props {
  value: string;
  onChange: (path: string) => void;
  label?: string;
}

export function DirectoryBrowser({ value, onChange, label = 'Working Directory' }: Props) {
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
    browse(value);
  }, [value, browse]);

  function navigateTo(dir: string) {
    onChange(resolvedPath + '/' + dir);
    setShowBrowser(true);
  }

  function navigateUp() {
    const parent = resolvedPath.replace(/\/[^/]+\/?$/, '') || '/';
    onChange(parent);
  }

  return (
    <>
      <label>
        {label}
        <div className="dir-input-row">
          <input
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
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
          <div className="dir-resolved">{resolvedPath}</div>
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
    </>
  );
}
