import { useState, useEffect } from 'react';
import type { TemplatePayload } from './DefaultForm';

interface Repo {
  name: string;
  path: string;
  mainPath: string;
}

interface Props {
  onPayloadChange: (payload: TemplatePayload) => void;
  onSuggestName: (name: string) => void;
}

export function WorktreeForm({ onPayloadChange, onSuggestName }: Props) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [worktreeName, setWorktreeName] = useState('');
  const [taskDesc, setTaskDesc] = useState('');

  useEffect(() => {
    fetch('/api/repos')
      .then((r) => r.json())
      .then((data) => setRepos(data.repos || []))
      .catch(() => {});
  }, []);

  const repo = repos.find((r) => r.name === selectedRepo);

  useEffect(() => {
    if (repo && worktreeName) {
      onSuggestName(`${repo.name}-${worktreeName}`);
    }
  }, [repo, worktreeName, onSuggestName]);

  useEffect(() => {
    if (!repo || !worktreeName) {
      onPayloadChange({ cwd: '~', command: '' });
      return;
    }

    const branch = `feat/${worktreeName}`;
    const worktreeDir = `${repo.path}/${repo.name}-${worktreeName}`;
    const escapedMain = repo.mainPath.replace(/'/g, "'\\''");
    const escapedDir = worktreeDir.replace(/'/g, "'\\''");
    const escapedBranch = branch.replace(/'/g, "'\\''");

    const command = `cd '${escapedMain}' && git fetch origin && git pull --ff-only && git worktree add '${escapedDir}' -b '${escapedBranch}' && cd '${escapedDir}' && claude`;

    onPayloadChange({
      cwd: repo.mainPath,
      command,
      worktreePath: worktreeDir,
      initialPrompt: taskDesc || undefined,
      repo: repo.name,
    });
  }, [repo, worktreeName, taskDesc, onPayloadChange]);

  return (
    <>
      <label>
        Repository
        <select
          value={selectedRepo}
          onChange={(e) => setSelectedRepo(e.target.value)}
          required
        >
          <option value="">Select a repository...</option>
          {repos.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Worktree Name
        <input
          value={worktreeName}
          onChange={(e) => setWorktreeName(e.target.value)}
          placeholder="add-dark-mode"
          required
          autoFocus
        />
      </label>

      <label>
        Task Description
        <textarea
          value={taskDesc}
          onChange={(e) => setTaskDesc(e.target.value)}
          placeholder="Describe what Claude should work on..."
          rows={3}
        />
      </label>
    </>
  );
}
