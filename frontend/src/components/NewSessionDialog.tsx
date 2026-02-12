import { useState, useCallback, type FormEvent } from 'react';
import { DefaultForm, type TemplatePayload } from './templates/DefaultForm';
import { GitCloneForm } from './templates/GitCloneForm';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const templates = [
  { id: 'directory', label: 'Directory' },
  { id: 'git-clone', label: 'Git Clone' },
] as const;

type TemplateId = (typeof templates)[number]['id'];

export function NewSessionDialog({ onClose, onCreated }: Props) {
  const [template, setTemplate] = useState<TemplateId>('directory');
  const [name, setName] = useState('');
  const [nameManual, setNameManual] = useState(false);
  const [payload, setPayload] = useState<TemplatePayload>({ cwd: '~', command: 'claude' });
  const [error, setError] = useState('');

  const handlePayloadChange = useCallback((p: TemplatePayload) => {
    setPayload(p);
  }, []);

  const handleSuggestName = useCallback((suggested: string) => {
    if (!nameManual) setName(suggested);
  }, [nameManual]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        cwd: payload.cwd,
        command: payload.command || undefined,
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

        <div className="template-selector">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`template-btn${template === t.id ? ' active' : ''}`}
              onClick={() => setTemplate(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label>
          Name
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameManual(true);
            }}
            placeholder="my-project"
            required
            autoFocus={template === 'directory'}
          />
        </label>

        {template === 'directory' && (
          <DefaultForm onPayloadChange={handlePayloadChange} />
        )}

        {template === 'git-clone' && (
          <GitCloneForm
            onPayloadChange={handlePayloadChange}
            onSuggestName={handleSuggestName}
          />
        )}

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
