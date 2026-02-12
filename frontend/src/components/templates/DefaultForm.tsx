import { useState, useEffect } from 'react';
import { DirectoryBrowser } from '../DirectoryBrowser';

export interface TemplatePayload {
  cwd: string;
  command: string;
  worktreePath?: string;
  initialPrompt?: string;
  repo?: string;
}

interface Props {
  onPayloadChange: (payload: TemplatePayload) => void;
}

export function DefaultForm({ onPayloadChange }: Props) {
  const [cwd, setCwd] = useState('~');
  const [command, setCommand] = useState('claude');

  useEffect(() => {
    onPayloadChange({ cwd, command: command || 'claude' });
  }, [cwd, command, onPayloadChange]);

  return (
    <>
      <DirectoryBrowser value={cwd} onChange={setCwd} />

      <label>
        Command
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="claude"
        />
      </label>
    </>
  );
}
