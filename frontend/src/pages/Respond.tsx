import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface McpRequest {
  requestId: string;
  sessionId: string;
  question: string;
  options: string[];
  allowText: boolean;
}

export function Respond() {
  const { requestId } = useParams<{ requestId: string }>();
  const [request, setRequest] = useState<McpRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customText, setCustomText] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch(`/api/mcp/requests/${requestId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Request not found or expired');
        return r.json();
      })
      .then(setRequest)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [requestId]);

  async function respond(response: string) {
    try {
      const res = await fetch('/api/mcp/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, response }),
      });
      if (!res.ok) throw new Error('Failed to send response');
      setSent(true);
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (loading) {
    return (
      <div className="respond-page">
        <div className="respond-card">Loading...</div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="respond-page">
        <div className="respond-card">
          <div className="respond-success">Response sent</div>
          <p className="respond-hint">You can close this page.</p>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="respond-page">
        <div className="respond-card">
          <div className="error">{error || 'Request not found'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="respond-page">
      <div className="respond-card">
        <h2>Claude is asking:</h2>
        <p className="respond-question">{request.question}</p>

        {request.options.length > 0 && (
          <div className="respond-options">
            {request.options.map((opt) => (
              <button key={opt} onClick={() => respond(opt)}>
                {opt}
              </button>
            ))}
          </div>
        )}

        {request.allowText && (
          <div className="respond-text">
            <input
              type="text"
              placeholder="Or type a response..."
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customText.trim()) {
                  respond(customText.trim());
                }
              }}
              autoFocus={request.options.length === 0}
            />
            <button
              onClick={() => customText.trim() && respond(customText.trim())}
              disabled={!customText.trim()}
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
