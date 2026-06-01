// ─────────────────────────────────────────────────────────────────────────────
// Input validation helpers — XSS-safe sanitization for user-provided strings
// ─────────────────────────────────────────────────────────────────────────────

/** Strip HTML tags and dangerous characters from a string. */
export function sanitizeText(input: string): string {
  return input
    .replace(/[<>"'`]/g, '') // strip HTML-injectable chars
    .replace(/javascript:/gi, '')
    .trim()
}

/**
 * Validate and sanitize a room code.
 * PeerJS peer IDs are alphanumeric + hyphens, variable length.
 */
export function validateRoomCode(raw: string): { ok: true; code: string } | { ok: false; error: string } {
  const code = raw.trim().replace(/[^a-zA-Z0-9\-_]/g, '')
  if (!code) return { ok: false, error: 'Room code cannot be empty.' }
  if (code.length < 4) return { ok: false, error: 'Room code is too short.' }
  if (code.length > 64) return { ok: false, error: 'Room code is too long.' }
  return { ok: true, code }
}

/**
 * Validate and sanitize a player name.
 * Max 24 characters, no HTML.
 */
export function validatePlayerName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = sanitizeText(raw).slice(0, 24)
  if (!name) return { ok: false, error: 'Name cannot be empty.' }
  return { ok: true, name }
}
