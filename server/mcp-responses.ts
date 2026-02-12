/** In-memory store for MCP ask_user requests and responses with TTL auto-cleanup */

interface PendingRequest {
  requestId: string;
  sessionId: string;
  question: string;
  options: string[];
  allowText: boolean;
  createdAt: number;
  response?: string;
}

const TTL_MS = 15 * 60 * 1000; // 15 minutes
const store = new Map<string, PendingRequest>();

// Cleanup expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, req] of store) {
    if (now - req.createdAt > TTL_MS) {
      store.delete(id);
    }
  }
}, 60_000);

export function createRequest(
  requestId: string,
  sessionId: string,
  question: string,
  options: string[] = [],
  allowText = true,
): void {
  store.set(requestId, {
    requestId,
    sessionId,
    question,
    options,
    allowText,
    createdAt: Date.now(),
  });
}

export function getRequest(requestId: string): PendingRequest | undefined {
  return store.get(requestId);
}

export function setResponse(requestId: string, response: string): boolean {
  const req = store.get(requestId);
  if (!req) return false;
  req.response = response;
  return true;
}

export function getResponse(requestId: string): string | undefined {
  return store.get(requestId)?.response;
}

export function deleteRequest(requestId: string): void {
  store.delete(requestId);
}
