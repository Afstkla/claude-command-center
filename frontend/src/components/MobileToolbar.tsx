import { useState, useCallback } from 'react';

interface Props {
  onSend: (data: string) => void;
}

// ANSI escape sequences for special keys
const KEYS = {
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  esc: '\x1b',
  tab: '\t',
} as const;

export function MobileToolbar({ onSend }: Props) {
  const [ctrlActive, setCtrlActive] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const send = useCallback((key: string) => {
    if (ctrlActive) {
      // Ctrl+key: send the control character (char code 1-26 for a-z)
      const code = key.toLowerCase().charCodeAt(0) - 96;
      if (code >= 1 && code <= 26) {
        onSend(String.fromCharCode(code));
      }
      setCtrlActive(false);
    } else {
      onSend(key);
    }
  }, [ctrlActive, onSend]);

  if (collapsed) {
    return (
      <button
        className="mobile-toolbar-toggle"
        onClick={() => setCollapsed(false)}
        aria-label="Show toolbar"
      >
        <span className="toggle-icon">&#x2328;</span>
      </button>
    );
  }

  return (
    <div className="mobile-toolbar">
      <button
        className="mobile-toolbar-toggle mobile-toolbar-toggle--inline"
        onClick={() => setCollapsed(true)}
        aria-label="Hide toolbar"
      >
        &times;
      </button>

      <div className="mobile-toolbar-keys">
        <button className="mkey" onPointerDown={() => send(KEYS.esc)}>Esc</button>
        <button className="mkey" onPointerDown={() => send(KEYS.tab)}>Tab</button>
        <button
          className={`mkey mkey--ctrl${ctrlActive ? ' mkey--active' : ''}`}
          onPointerDown={() => setCtrlActive((v) => !v)}
        >
          Ctrl
        </button>

        <span className="mobile-toolbar-sep" />

        <button className="mkey mkey--arrow" onPointerDown={() => send(KEYS.up)}>&#x25B2;</button>
        <button className="mkey mkey--arrow" onPointerDown={() => send(KEYS.down)}>&#x25BC;</button>
        <button className="mkey mkey--arrow" onPointerDown={() => send(KEYS.left)}>&#x25C0;</button>
        <button className="mkey mkey--arrow" onPointerDown={() => send(KEYS.right)}>&#x25B6;</button>
      </div>

      {ctrlActive && (
        <div className="mobile-toolbar-hint">
          Ctrl mode: tap a letter key on your keyboard
        </div>
      )}
    </div>
  );
}
