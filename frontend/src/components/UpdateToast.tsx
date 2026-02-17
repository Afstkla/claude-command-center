import { useState, useEffect } from 'react';

const POLL_INTERVAL = 30_000; // 30 seconds

export function UpdateToast() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let initialHash: string | null = null;

    async function check() {
      try {
        const res = await fetch('/api/version');
        if (!res.ok) return;
        const { hash } = await res.json();
        if (!hash) return;

        if (initialHash === null) {
          initialHash = hash;
        } else if (hash !== initialHash) {
          setUpdateAvailable(true);
        }
      } catch {
        // Server unreachable, ignore
      }
    }

    check();
    const id = setInterval(check, POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="update-toast">
      A new version is available.
      <button onClick={() => location.reload()}>Reload</button>
    </div>
  );
}
