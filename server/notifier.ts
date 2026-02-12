const NTFY_URL = process.env.NTFY_URL || 'https://ntfy.sh';
const NTFY_TOPIC = process.env.NTFY_TOPIC || '';
const NTFY_ENABLED = process.env.NTFY_ENABLED === 'true';
const NTFY_AUTH_TOKEN = process.env.NTFY_AUTH_TOKEN || '';
const BASE_URL = process.env.BASE_URL || '';

interface ToolInfo {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

/** Format tool info into a readable notification body */
function formatBody(sessionName: string, tool?: ToolInfo): string {
  if (!tool?.tool_name) {
    return `Claude is waiting for approval in "${sessionName}"`;
  }

  const name = tool.tool_name;
  const input = tool.tool_input || {};

  switch (name) {
    case 'Bash':
      return input.command
        ? `$ ${input.command}`
        : `Bash command`;
    case 'Edit':
      return input.file_path
        ? `Edit ${input.file_path}`
        : 'File edit';
    case 'Write':
      return input.file_path
        ? `Write ${input.file_path}`
        : 'File write';
    case 'Read':
      return input.file_path
        ? `Read ${input.file_path}`
        : 'File read';
    default:
      return `${name}`;
  }
}

/** Format a short title from tool info */
function formatTitle(sessionName: string, tool?: ToolInfo): string {
  if (!tool?.tool_name) {
    return `${sessionName}: Waiting for input`;
  }
  return `${sessionName}: ${tool.tool_name}`;
}

/** Send a push notification via ntfy when a session needs attention */
export async function notifyWaiting(sessionId: string, sessionName: string, tool?: ToolInfo) {
  if (!NTFY_ENABLED || !NTFY_TOPIC) return;

  const actions: string[] = [];

  if (BASE_URL) {
    const inputUrl = `${BASE_URL}/api/sessions/${sessionId}/input?token=${NTFY_AUTH_TOKEN}`;
    actions.push(
      `http, Yes, ${inputUrl}, body='{"text":"y"}', headers.Content-Type=application/json`,
      `http, No, ${inputUrl}, body='{"text":"n"}', headers.Content-Type=application/json`,
      `view, Open, ${BASE_URL}/session/${sessionId}`,
    );
  }

  await fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
    method: 'POST',
    headers: {
      'Title': formatTitle(sessionName, tool),
      'Tags': 'robot,warning',
      'Priority': '4',
      ...(actions.length ? { 'Actions': actions.join('; ') } : {}),
    },
    body: formatBody(sessionName, tool),
  }).catch((err) => {
    console.error('[ntfy] Failed to send notification:', err.message);
  });
}
