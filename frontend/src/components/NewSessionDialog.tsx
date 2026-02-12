import { useState, type FormEvent } from 'react';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function NewSessionDialog({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [cwd, setCwd] = useState('~');
  const [command, setCommand] = useState('claude');
  const [error, setError] = useState('');

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
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="/path/to/project"
            required
          />
        </label>

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
