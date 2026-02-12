const NTFY_URL = process.env.NTFY_URL || 'https://ntfy.sh';
const NTFY_TOPIC = process.env.NTFY_TOPIC || '';
const NTFY_ENABLED = process.env.NTFY_ENABLED === 'true';
const NTFY_AUTH_TOKEN = process.env.NTFY_AUTH_TOKEN || '';
const BASE_URL = process.env.BASE_URL || '';

/** Send a push notification via ntfy when a session enters "waiting" state */
export async function notifyWaiting(sessionId: string, sessionName: string) {
  if (!NTFY_ENABLED || !NTFY_TOPIC) return;

  const actions: string[] = [];

  if (BASE_URL) {
    const inputUrl = `${BASE_URL}/api/sessions/${sessionId}/input?token=${NTFY_AUTH_TOKEN}`;
    actions.push(
      `http, Yes, ${inputUrl}, body='{"text":"y"}', headers.Content-Type=application/json`,
      `http, Continue, ${inputUrl}, body='{"text":""}', headers.Content-Type=application/json`,
      `view, Open, ${BASE_URL}/session/${sessionId}`,
    );
  }

  await fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
    method: 'POST',
    headers: {
      'Title': `${sessionName}: Waiting for input`,
      'Tags': 'robot,warning',
      'Priority': '4',
      ...(actions.length ? { 'Actions': actions.join('; ') } : {}),
    },
    body: `Claude is waiting for approval in session "${sessionName}"`,
  }).catch((err) => {
    console.error('[ntfy] Failed to send notification:', err.message);
  });
}
