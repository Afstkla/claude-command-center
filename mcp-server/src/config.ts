export const config = {
  baseUrl: process.env.CC_BASE_URL || process.env.BASE_URL || '',
  ntfyUrl: process.env.CC_NTFY_URL || process.env.NTFY_URL || 'https://ntfy.sh',
  ntfyTopic: process.env.CC_NTFY_TOPIC || process.env.NTFY_TOPIC || '',
  authToken: process.env.CC_AUTH_TOKEN || process.env.NTFY_AUTH_TOKEN || '',
  pollIntervalMs: parseInt(process.env.CC_POLL_INTERVAL || '1500', 10),
  timeoutMs: parseInt(process.env.CC_TIMEOUT || '600000', 10), // 10 min
};
