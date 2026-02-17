import { useState, useCallback, useRef, useEffect } from 'react';

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

/** Prevent focus from leaving the terminal (keeps mobile keyboard open) */
function noFocus(e: React.PointerEvent | React.MouseEvent) {
  e.preventDefault();
}

export function MobileToolbar({ onSend }: Props) {
  const [ctrlActive, setCtrlActive] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const ctrlRef = useRef(false);

  // Keep ref in sync so the xterm interceptor always sees current state
  useEffect(() => { ctrlRef.current = ctrlActive; }, [ctrlActive]);

  // Register a global keydown listener when ctrl mode is active.
  // This intercepts keyboard input before xterm sees it and sends
  // the corresponding control character (Ctrl+C = \x03, etc).
  useEffect(() => {
    if (!ctrlActive) return;

    function handleKey(e: KeyboardEvent) {
      if (!ctrlRef.current) return;
      if (e.key.length !== 1) return; // ignore shift, meta, etc.

      const code = e.key.toLowerCase().charCodeAt(0) - 96;
      if (code >= 1 && code <= 26) {
        e.preventDefault();
        e.stopPropagation();
        onSend(String.fromCharCode(code));
      }
      setCtrlActive(false);
    }

    // Use capture phase to intercept before xterm's handler
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [ctrlActive, onSend]);

  if (collapsed) {
    return (
      <button
        className="mobile-toolbar-toggle"
        onPointerDown={noFocus}
        onClick={() => setCollapsed(false)}
        aria-label="Show toolbar"
      >
        <span className="toggle-icon">&#x2328;</span>
      </button>
    );
  }

  return (
    <div className="mobile-toolbar" onPointerDown={noFocus}>
      <button
        className="mobile-toolbar-toggle mobile-toolbar-toggle--inline"
        onClick={() => setCollapsed(true)}
        aria-label="Hide toolbar"
      >
        &times;
      </button>

      <div className="mobile-toolbar-keys">
        <button className="mkey" onClick={() => onSend(KEYS.esc)}>Esc</button>
        <button className="mkey" onClick={() => onSend(KEYS.tab)}>Tab</button>
        <button
          className={`mkey mkey--ctrl${ctrlActive ? ' mkey--active' : ''}`}
          onClick={() => setCtrlActive((v) => !v)}
        >
          Ctrl
        </button>

        <span className="mobile-toolbar-sep" />

        <button className="mkey mkey--arrow" onClick={() => onSend(KEYS.up)}>&#x25B2;</button>
        <button className="mkey mkey--arrow" onClick={() => onSend(KEYS.down)}>&#x25BC;</button>
        <button className="mkey mkey--arrow" onClick={() => onSend(KEYS.left)}>&#x25C0;</button>
        <button className="mkey mkey--arrow" onClick={() => onSend(KEYS.right)}>&#x25B6;</button>
      </div>

      {ctrlActive && (
        <div className="mobile-toolbar-hint">
          Ctrl mode: tap a letter key
        </div>
      )}
    </div>
  );
}
