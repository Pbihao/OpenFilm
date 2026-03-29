/**
 * Local file persistence — writes/reads assets via the Vite dev-server plugin.
 * Silently no-ops in production (no server).
 *
 * POST /api/local-save?session=xxx&filename=yyy  → writes local-data/xxx/yyy
 * GET  /api/local-data?session=xxx&filename=yyy  → serves local-data/xxx/yyy
 */

const API_WRITE = '/api/local-save';
const API_READ  = '/api/local-data';

/** Returns true if the local-save API is reachable (dev mode). */
let _available: boolean | null = null;
async function isAvailable(): Promise<boolean> {
  if (_available !== null) return _available;
  try {
    const res = await fetch(API_WRITE, { method: 'POST', body: new Blob() });
    // 405 or 200 both mean the server exists
    _available = res.status !== 404;
  } catch {
    _available = false;
  }
  return _available;
}

/** Returns the local serve URL for a saved file (does NOT save anything). */
export function getLocalUrl(sessionFolder: string, filename: string): string {
  return `${API_READ}?session=${encodeURIComponent(sessionFolder)}&filename=${encodeURIComponent(filename)}`;
}

/**
 * Writes a file to local-data/{sessionFolder}/{filename}.
 * Returns the local serve URL on success, null on failure (server unavailable or error).
 * Never throws.
 */
export async function writeSessionFile(
  sessionFolder: string,
  filename: string,
  data: Blob | string,
): Promise<string | null> {
  try {
    if (!(await isAvailable())) return null;
    const body = data instanceof Blob ? data : new Blob([data], { type: 'application/json' });
    const res = await fetch(
      `${API_WRITE}?session=${encodeURIComponent(sessionFolder)}&filename=${encodeURIComponent(filename)}`,
      { method: 'POST', body },
    );
    if (!res.ok) return null;
    return getLocalUrl(sessionFolder, filename);
  } catch {
    return null;
  }
}

/** Generates a session folder name from the current timestamp. */
export function makeSessionFolder(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `session_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
