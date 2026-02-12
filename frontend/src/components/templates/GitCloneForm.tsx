import { useState, useEffect } from 'react';
import { DirectoryBrowser } from '../DirectoryBrowser';
import type { TemplatePayload } from './DefaultForm';

interface Props {
  onPayloadChange: (payload: TemplatePayload) => void;
  onSuggestName: (name: string) => void;
}

function repoNameFromUrl(url: string): string {
  const match = url.match(/\/([^/]+?)(\.git)?$/);
  return match ? match[1] : '';
}

export function GitCloneForm({ onPayloadChange, onSuggestName }: Props) {
  const [repoUrl, setRepoUrl] = useState('');
  const [dirName, setDirName] = useState('');
  const [dirNameManual, setDirNameManual] = useState(false);
  const [parentDir, setParentDir] = useState('~');

  const effectiveDirName = dirNameManual ? dirName : repoNameFromUrl(repoUrl);

  useEffect(() => {
    if (!dirNameManual) {
      const derived = repoNameFromUrl(repoUrl);
      setDirName(derived);
      if (derived) onSuggestName(derived);
    }
  }, [repoUrl, dirNameManual, onSuggestName]);

  useEffect(() => {
    if (!repoUrl || !effectiveDirName) {
      onPayloadChange({ cwd: parentDir, command: '' });
      return;
    }
    const escapedDir = effectiveDirName.replace(/'/g, "'\\''");
    const command = `git clone ${repoUrl} '${escapedDir}' && cd '${escapedDir}' && claude`;
    onPayloadChange({ cwd: parentDir, command });
  }, [repoUrl, effectiveDirName, parentDir, onPayloadChange]);

  return (
    <>
      <label>
        Repository URL
        <input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/user/repo"
          required
          autoFocus
        />
      </label>

      <label>
        Directory Name
        <input
          value={effectiveDirName}
          onChange={(e) => {
            setDirName(e.target.value);
            setDirNameManual(true);
          }}
          placeholder="repo-name"
          required
        />
      </label>

      <DirectoryBrowser
        value={parentDir}
        onChange={setParentDir}
        label="Clone Into"
      />
    </>
  );
}
