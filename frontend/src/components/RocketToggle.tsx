import { useState } from 'react';

interface Props {
  sessionId: string;
  initial: boolean;
}

export function RocketToggle({ sessionId, initial }: Props) {
  const [enabled, setEnabled] = useState(initial);
  const [confirmEnable, setConfirmEnable] = useState(false);

  async function toggle() {
    // Enabling requires confirmation, disabling is immediate
    if (!enabled && !confirmEnable) {
      setConfirmEnable(true);
      setTimeout(() => setConfirmEnable(false), 3000);
      return;
    }

    setConfirmEnable(false);
    const res = await fetch(`/api/sessions/${sessionId}/rocket`, { method: 'POST' });
    if (res.ok) {
      const { rocket_mode } = await res.json();
      setEnabled(rocket_mode);
    }
  }

  return (
    <button
      className={`rocket-btn${enabled ? ' rocket-btn--active' : ''}${confirmEnable ? ' rocket-btn--confirm' : ''}`}
      onClick={toggle}
      title={enabled ? 'Rocket mode on — click to disable' : 'Enable rocket mode (auto-approve tools)'}
    >
      {confirmEnable ? 'Enable?' : '\u{1F680}'}
    </button>
  );
}
