// apiRequest throws Error(`${status}: ${bodyText}`), and route handlers send
// JSON bodies (`{"message": "..."}`) — this unwraps that back to plain text.
export function parseApiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const stripped = err.message.replace(/^\d+:\s*/, '');
  try {
    const parsed = JSON.parse(stripped) as { message?: string };
    return parsed.message || fallback;
  } catch {
    return stripped || fallback;
  }
}
