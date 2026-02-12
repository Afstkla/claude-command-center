import { config } from './config.js';

/** Generate a short random ID for requests */
function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Send a fire-and-forget notification via ntfy */
export async function notifyUser(message: string, priority?: number): Promise<string> {
  if (!config.ntfyTopic) {
    return 'Notification skipped: no ntfy topic configured.';
  }

  const headers: Record<string, string> = {
    Title: 'Command Center',
    Tags: 'robot',
    Priority: String(priority ?? 3),
  };

  try {
    await fetch(`${config.ntfyUrl}/${config.ntfyTopic}`, {
      method: 'POST',
      headers,
      body: message,
    });
    return 'Notification sent.';
  } catch (err: any) {
    return `Failed to send notification: ${err.message}`;
  }
}

/** Send a notification with question + options, then block until user responds */
export async function askUser(
  question: string,
  options: string[] = [],
  allowText = true,
): Promise<string> {
  if (!config.baseUrl) {
    return 'Error: no BASE_URL configured — cannot reach Command Center API.';
  }

  const requestId = randomId();

  // 1. Store the request on the command center server
  try {
    const res = await fetch(`${config.baseUrl}/api/mcp/requests?token=${config.authToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, question, options, allowText }),
    });
    if (!res.ok) {
      return `Error storing request: ${res.status} ${await res.text()}`;
    }
  } catch (err: any) {
    return `Error reaching Command Center: ${err.message}`;
  }

  // 2. Send ntfy notification with action buttons
  if (config.ntfyTopic) {
    const respondUrl = `${config.baseUrl}/api/mcp/respond?token=${config.authToken}`;
    const actions: string[] = [];

    // ntfy allows max 3 actions — use options (up to 2) + Reply link
    const buttonOptions = options.slice(0, 2);
    for (const opt of buttonOptions) {
      const body = JSON.stringify({ requestId, response: opt });
      actions.push(
        `http, ${opt}, ${respondUrl}, body='${body}', headers.Content-Type=application/json, clear=true`,
      );
    }
    actions.push(`view, Reply, ${config.baseUrl}/respond/${requestId}`);

    try {
      await fetch(`${config.ntfyUrl}/${config.ntfyTopic}`, {
        method: 'POST',
        headers: {
          Title: 'Claude is asking',
          Tags: 'robot,question',
          Priority: '4',
          Actions: actions.join('; '),
        },
        body: question,
      });
    } catch {
      // Non-fatal: user can still respond via web page
      console.error('[mcp] Failed to send ntfy notification');
    }
  }

  // 3. Poll for the response
  const deadline = Date.now() + config.timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(
        `${config.baseUrl}/api/mcp/responses/${requestId}?token=${config.authToken}`,
      );
      if (res.status === 200) {
        const data = (await res.json()) as { response: string };
        return data.response;
      }
      // 204 = no response yet
    } catch {
      // Transient error — keep polling
    }

    await new Promise((r) => setTimeout(r, config.pollIntervalMs));
  }

  return 'Timeout: no response received within the time limit.';
}
