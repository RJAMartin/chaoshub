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
 * Validate and normalise a room code.
 * Room codes are exactly 6 uppercase alphanumeric characters (e.g. "ABC123").
 * Input is normalised: lowercased letters are uppercased, whitespace stripped.
 * The returned `code` is always 6 uppercase chars ready for use.
 */
export function validateRoomCode(raw: string): { ok: true; code: string } | { ok: false; error: string } {
  // Normalise: uppercase, strip everything that isn't A-Z or 0-9
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!code) return { ok: false, error: 'Room code cannot be empty.' }
  if (code.length !== 6) return { ok: false, error: 'Room code must be exactly 6 characters (e.g. ABC123).' }
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
