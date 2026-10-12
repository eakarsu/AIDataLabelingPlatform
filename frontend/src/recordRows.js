// Normalize the list payloads used by both plain and paginated API routes.
export function recordRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray(payload.data)) return payload.data;
  return [];
}
